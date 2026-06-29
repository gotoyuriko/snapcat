import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { api } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FoodItem {
  id: string;
  name: string;
  priceMyr: number;
  description?: string;
}

interface InventoryItem {
  foodItemId: string;
  name: string;
  priceMyr: number;
  quantity: number;
}

interface WalletInfo {
  balanceMyr: number;
}

interface TopUpResponse {
  paymentUrl: string;
}

interface PurchaseResponse {
  success: boolean;
  newBalanceMyr: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WalletScreen() {
  // Wallet state
  const [balance, setBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(true);

  // Top-up state
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);

  // Food catalogue state
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // Cart state: { foodItemId → quantity }
  const [cart, setCart] = useState<Record<string, number>>({});

  // Inventory state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);

  // Purchase loading
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchBalance = useCallback(async () => {
    try {
      const data = await api.get<WalletInfo>('/wallet');
      setBalance(data.balanceMyr);
    } catch {
      // Wallet may not exist yet — default to 0
      setBalance(0);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  const fetchFoodItems = useCallback(async () => {
    try {
      const data = await api.get<FoodItem[]>('/food-items');
      setFoodItems(data);
    } catch {
      setFoodItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const data = await api.get<InventoryItem[]>('/food-items/inventory');
      setInventory(data);
    } catch {
      setInventory([]);
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    fetchFoodItems();
    fetchInventory();
  }, [fetchBalance, fetchFoodItems, fetchInventory]);

  // ─── Top-Up Handler ───────────────────────────────────────────────────────

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount in MYR.');
      return;
    }

    setTopUpLoading(true);
    try {
      const response = await api.post<TopUpResponse>('/wallet/topup', {
        amountMyr: amount,
      });

      // Open payment URL in the device's browser (in-app browser)
      if (response.paymentUrl) {
        const supported = await Linking.canOpenURL(response.paymentUrl);
        if (supported) {
          await Linking.openURL(response.paymentUrl);
        } else {
          Alert.alert('Error', 'Cannot open payment page. Please try again.');
        }
      }

      setTopUpAmount('');
      // Balance will update after payment webhook is processed;
      // refresh balance after a short delay for UX
      setTimeout(() => {
        fetchBalance();
      }, 3000);
    } catch {
      Alert.alert('Top-Up Failed', 'Unable to initiate top-up. Please try again.');
    } finally {
      setTopUpLoading(false);
    }
  };

  // ─── Cart Helpers ─────────────────────────────────────────────────────────

  const addToCart = (itemId: string) => {
    setCart((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || 0) + 1,
    }));
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const current = prev[itemId] || 0;
      if (current <= 1) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: current - 1 };
    });
  };

  const cartTotal = Object.entries(cart).reduce((sum, [itemId, qty]) => {
    const item = foodItems.find((f) => f.id === itemId);
    return sum + (item?.priceMyr ?? 0) * qty;
  }, 0);

  const cartItemCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  // ─── Purchase Handler ─────────────────────────────────────────────────────

  const handlePurchase = async () => {
    if (cartItemCount === 0) {
      Alert.alert('Empty Cart', 'Please add items to your cart first.');
      return;
    }

    if (cartTotal > balance) {
      Alert.alert(
        'Insufficient Balance',
        `You need RM ${cartTotal.toFixed(2)} but only have RM ${balance.toFixed(2)}. Please top up your wallet first.`,
      );
      return;
    }

    const items = Object.entries(cart).map(([foodItemId, quantity]) => ({
      foodItemId,
      quantity,
    }));

    setPurchaseLoading(true);
    try {
      const response = await api.post<PurchaseResponse>('/food-items/purchase', {
        items,
      });

      if (response.success) {
        // Update balance from server response
        setBalance(response.newBalanceMyr);
        setCart({});
        // Refresh inventory to show newly purchased items
        fetchInventory();
        Alert.alert('Purchase Successful', 'Items added to your inventory!');
      }
    } catch {
      Alert.alert('Purchase Failed', 'Unable to complete purchase. Please try again.');
    } finally {
      setPurchaseLoading(false);
    }
  };

  // ─── Inventory Credit Total ───────────────────────────────────────────────

  const inventoryTotalCredit = inventory.reduce(
    (sum, item) => sum + item.priceMyr * item.quantity,
    0,
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loadingBalance || loadingItems) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF8C00" />
        <Text style={styles.loadingText}>Loading wallet...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ─── Wallet Balance ─────────────────────────────────────────── */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Wallet Balance</Text>
        <Text style={styles.balanceAmount}>RM {balance.toFixed(2)}</Text>
      </View>

      {/* ─── Top-Up Section ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Up Wallet</Text>
        <View style={styles.topUpRow}>
          <TextInput
            style={styles.topUpInput}
            placeholder="Amount (MYR)"
            placeholderTextColor="#999"
            keyboardType="numeric"
            value={topUpAmount}
            onChangeText={setTopUpAmount}
            editable={!topUpLoading}
            accessibilityLabel="Top-up amount in MYR"
          />
          <TouchableOpacity
            style={[styles.topUpButton, topUpLoading && styles.buttonDisabled]}
            onPress={handleTopUp}
            disabled={topUpLoading}
            accessibilityLabel="Confirm top-up"
            accessibilityRole="button"
          >
            {topUpLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.topUpButtonText}>Top Up</Text>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.quickAmounts}>
          {[5, 10, 20, 50].map((amt) => (
            <TouchableOpacity
              key={amt}
              style={styles.quickAmountChip}
              onPress={() => setTopUpAmount(String(amt))}
              accessibilityLabel={`Set top-up amount to RM ${amt}`}
            >
              <Text style={styles.quickAmountText}>RM {amt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ─── Food Item Catalogue ────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Food Items</Text>
        {foodItems.length === 0 ? (
          <Text style={styles.emptyText}>No food items available</Text>
        ) : (
          foodItems.map((item) => {
            const qty = cart[item.id] || 0;
            return (
              <View key={item.id} style={styles.foodItemRow}>
                <View style={styles.foodItemInfo}>
                  <Text style={styles.foodItemName}>{item.name}</Text>
                  <Text style={styles.foodItemPrice}>
                    RM {item.priceMyr.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.quantityControls}>
                  {qty > 0 && (
                    <TouchableOpacity
                      style={styles.qtyButton}
                      onPress={() => removeFromCart(item.id)}
                      accessibilityLabel={`Remove one ${item.name} from cart`}
                    >
                      <Text style={styles.qtyButtonText}>−</Text>
                    </TouchableOpacity>
                  )}
                  {qty > 0 && <Text style={styles.qtyText}>{qty}</Text>}
                  <TouchableOpacity
                    style={styles.qtyButton}
                    onPress={() => addToCart(item.id)}
                    accessibilityLabel={`Add one ${item.name} to cart`}
                  >
                    <Text style={styles.qtyButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ─── Checkout Section ───────────────────────────────────────── */}
      {cartItemCount > 0 && (
        <View style={styles.checkoutSection}>
          <Text style={styles.checkoutTitle}>Checkout</Text>
          {Object.entries(cart).map(([itemId, qty]) => {
            const item = foodItems.find((f) => f.id === itemId);
            if (!item) return null;
            return (
              <View key={itemId} style={styles.checkoutRow}>
                <Text style={styles.checkoutItemName}>
                  {item.name} × {qty}
                </Text>
                <Text style={styles.checkoutItemTotal}>
                  RM {(item.priceMyr * qty).toFixed(2)}
                </Text>
              </View>
            );
          })}
          <View style={styles.checkoutTotalRow}>
            <Text style={styles.checkoutTotalLabel}>Total</Text>
            <Text style={styles.checkoutTotalAmount}>
              RM {cartTotal.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.purchaseButton, purchaseLoading && styles.buttonDisabled]}
            onPress={handlePurchase}
            disabled={purchaseLoading}
            accessibilityLabel="Confirm purchase"
            accessibilityRole="button"
          >
            {purchaseLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.purchaseButtonText}>Purchase</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Inventory Section ──────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Inventory</Text>
        {loadingInventory ? (
          <ActivityIndicator size="small" color="#FF8C00" />
        ) : inventory.length === 0 ? (
          <Text style={styles.emptyText}>
            No items in inventory. Purchase food items above to donate to cats!
          </Text>
        ) : (
          <>
            {inventory.map((item) => (
              <View key={item.foodItemId} style={styles.inventoryRow}>
                <Text style={styles.inventoryName}>{item.name}</Text>
                <Text style={styles.inventoryQty}>× {item.quantity}</Text>
                <Text style={styles.inventoryValue}>
                  RM {(item.priceMyr * item.quantity).toFixed(2)}
                </Text>
              </View>
            ))}
            <View style={styles.inventoryTotalRow}>
              <Text style={styles.inventoryTotalLabel}>
                Total Inventory Value
              </Text>
              <Text style={styles.inventoryTotalAmount}>
                RM {inventoryTotalCredit.toFixed(2)}
              </Text>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },

  // Balance card
  balanceCard: {
    backgroundColor: '#FF8C00',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  balanceLabel: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 4,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },

  // Sections
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },

  // Top-up
  topUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topUpInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
  },
  topUpButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  topUpButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  quickAmountChip: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  quickAmountText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },

  // Food items
  foodItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  foodItemInfo: {
    flex: 1,
  },
  foodItemName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  foodItemPrice: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF8C00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    minWidth: 20,
    textAlign: 'center',
  },

  // Checkout
  checkoutSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FF8C00',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  checkoutTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  checkoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  checkoutItemName: {
    fontSize: 14,
    color: '#555',
  },
  checkoutItemTotal: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  checkoutTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  checkoutTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  checkoutTotalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF8C00',
  },
  purchaseButton: {
    backgroundColor: '#FF8C00',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Inventory
  inventoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  inventoryName: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  inventoryQty: {
    fontSize: 14,
    color: '#666',
    marginRight: 12,
  },
  inventoryValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  inventoryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 8,
  },
  inventoryTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  inventoryTotalAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
