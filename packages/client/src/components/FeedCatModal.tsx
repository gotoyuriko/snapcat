/**
 * Floating feeding window shown over the cat profile.
 * Lets the user pick a food item from their inventory and donate it without
 * leaving the screen. On success the modal closes itself and reports the XP
 * result to the parent so it can play the reward animation.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Alert,
  Pressable,
} from 'react-native';
import { api, ApiError } from '../services/api';
import { FoodIcon } from './FoodIcons';

export interface FeedResult {
  xpAwarded: number;
  newLevel?: number;
  levelUp?: boolean;
}

interface FeedCatModalProps {
  visible: boolean;
  catId: string;
  onClose: () => void;
  /** Called after a successful donation, once the modal has closed. */
  onSuccess: (result: FeedResult) => void;
}

interface InventoryItem {
  foodItemId: string;
  name: string;
  priceMyr: number;
  quantity: number;
}

interface FoodItemsResponse {
  inventory: InventoryItem[];
}

export function FeedCatModal({ visible, catId, onClose, onSuccess }: FeedCatModalProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [inventoryError, setInventoryError] = useState(false);
  // Donation count per food item (foodItemId -> quantity to donate)
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isDonating, setIsDonating] = useState(false);

  const totalCount = inventory.reduce(
    (sum, item) => sum + (quantities[item.foodItemId] ?? 0),
    0,
  );
  // Server awards 1 XP per MYR per donation batch (see gamification.service.ts)
  const xpPreview = inventory.reduce(
    (sum, item) => sum + Math.floor(item.priceMyr * (quantities[item.foodItemId] ?? 0)),
    0,
  );

  const adjustQuantity = useCallback((item: InventoryItem, delta: number) => {
    setQuantities((prev) => {
      const current = prev[item.foodItemId] ?? 0;
      const next = Math.max(0, Math.min(item.quantity, current + delta));
      return { ...prev, [item.foodItemId]: next };
    });
  }, []);

  // Pop-in animation for the card
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  const fetchInventory = useCallback(async () => {
    setLoadingInventory(true);
    setInventoryError(false);
    try {
      const data = await api.get<FoodItemsResponse>('/food-items');
      setInventory(data.inventory.filter((entry) => entry.quantity > 0));
    } catch {
      setInventoryError(true);
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setQuantities({});
      fetchInventory();
      cardScale.setValue(0.85);
      cardOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, friction: 7 }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, fetchInventory, cardScale, cardOpacity]);

  const handleDonate = useCallback(async () => {
    if (isDonating) return;
    const toDonate = inventory
      .map((item) => ({ item, count: quantities[item.foodItemId] ?? 0 }))
      .filter((entry) => entry.count > 0);
    if (toDonate.length === 0) return;

    setIsDonating(true);
    // One request per food type; XP accumulates across all of them so the
    // profile popup shows the grand total.
    let totalXp = 0;
    let newLevel: number | undefined;
    let levelUp = false;
    let donatedAny = false;
    let failedItem: string | null = null;

    for (const { item, count } of toDonate) {
      try {
        const result = await api.post<{
          xpAwarded?: number;
          newLevel?: number;
          levelUp?: boolean;
        }>('/donations', { catId, foodItemId: item.foodItemId, quantity: count });
        donatedAny = true;
        totalXp += result?.xpAwarded ?? 0;
        if (result?.newLevel != null) newLevel = result.newLevel;
        if (result?.levelUp) levelUp = true;
      } catch (error) {
        failedItem =
          error instanceof ApiError && error.serverMessage
            ? `${item.name}: ${error.serverMessage}`
            : `${item.name}: donation failed`;
        break;
      }
    }

    setIsDonating(false);

    if (failedItem && !donatedAny) {
      Alert.alert('Error', failedItem);
      return;
    }
    if (failedItem) {
      Alert.alert('Partial donation', `Some food could not be donated.\n${failedItem}`);
    }
    onClose();
    onSuccess({ xpAwarded: totalXp, newLevel, levelUp });
  }, [inventory, quantities, isDonating, catId, onClose, onSuccess]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={isDonating ? undefined : onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={[styles.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>🍖 Feed This Cat</Text>
              <TouchableOpacity
                onPress={onClose}
                disabled={isDonating}
                accessibilityLabel="Close feeding window"
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingInventory ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#FF8C00" />
                <Text style={styles.subtitle}>Loading your food inventory...</Text>
              </View>
            ) : inventoryError ? (
              <View style={styles.centerBox}>
                <Text style={styles.subtitle}>
                  Could not load your food inventory. Check your connection and try again.
                </Text>
                <TouchableOpacity
                  style={styles.donateButton}
                  onPress={fetchInventory}
                  accessibilityRole="button"
                  accessibilityLabel="Retry"
                >
                  <Text style={styles.donateButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : inventory.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.subtitle}>
                  You have no food in your inventory. Purchase food from the Wallet screen
                  first, then come back to feed this cat.
                </Text>
              </View>
            ) : (
              <>
                {/* One stepper bar per food — mix and match freely */}
                {inventory.map((item) => {
                  const count = quantities[item.foodItemId] ?? 0;
                  return (
                    <View
                      key={item.foodItemId}
                      style={[styles.stepperBar, count > 0 && styles.stepperBarActive]}
                    >
                      <TouchableOpacity
                        style={[styles.stepperButton, count <= 0 && styles.stepperButtonDisabled]}
                        onPress={() => adjustQuantity(item, -1)}
                        disabled={count <= 0}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove one ${item.name}`}
                      >
                        <Text style={styles.stepperButtonText}>−</Text>
                      </TouchableOpacity>

                      <View style={styles.stepperCenter}>
                        <FoodIcon name={item.name} size={26} />
                        <View style={styles.stepperInfo}>
                          <Text style={styles.stepperItemName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.stepperStock}>×{item.quantity} owned</Text>
                        </View>
                        <Text style={styles.stepperQuantity}>{count}</Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.stepperButton,
                          count >= item.quantity && styles.stepperButtonDisabled,
                        ]}
                        onPress={() => adjustQuantity(item, 1)}
                        disabled={count >= item.quantity}
                        accessibilityRole="button"
                        accessibilityLabel={`Add one ${item.name}`}
                      >
                        <Text style={styles.stepperButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {/* XP preview */}
                <View style={styles.xpPreviewRow}>
                  <Text style={styles.xpPreviewLabel}>XP you'll earn:</Text>
                  <Text style={styles.xpPreviewValue}>
                    {totalCount > 0 ? `+${xpPreview} XP` : '—'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.donateButton,
                    (totalCount === 0 || isDonating) && styles.donateButtonDisabled,
                  ]}
                  onPress={handleDonate}
                  disabled={totalCount === 0 || isDonating}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm Donation"
                  accessibilityState={{ disabled: totalCount === 0 || isDonating }}
                >
                  {isDonating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.donateButtonText}>Feed Cat</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  closeIcon: {
    fontSize: 18,
    color: '#999',
    fontWeight: '600',
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  stepperBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF8F0',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFE0B2',
    padding: 10,
    marginBottom: 12,
  },
  stepperCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  stepperItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    flexShrink: 1,
  },
  stepperQuantity: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FF8C00',
    minWidth: 32,
    textAlign: 'center',
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FF8C00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonDisabled: {
    backgroundColor: '#E0E0E0',
  },
  stepperButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 28,
  },
  stepperBarActive: {
    borderColor: '#FF8C00',
    backgroundColor: '#FFF4E5',
  },
  stepperInfo: {
    flex: 1,
  },
  stepperStock: {
    fontSize: 11,
    color: '#999',
    marginTop: 1,
  },
  xpPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F8E9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  xpPreviewLabel: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  xpPreviewValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4CAF50',
  },
  donateButton: {
    width: '100%',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  donateButtonDisabled: {
    backgroundColor: '#CCC',
  },
  donateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
