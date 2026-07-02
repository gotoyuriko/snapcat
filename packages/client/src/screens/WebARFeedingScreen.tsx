import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { api, ApiError } from '../services/api';

const WEBAR_BASE_URL = 'https://ar.codingkitty.app/feed';

type Props = NativeStackScreenProps<RootStackParamList, 'WebARFeeding'>;

interface FeedingCompletePayload {
  type: 'feedingComplete';
  catId: string;
  foodItemId: string;
}

export function WebARFeedingScreen({ route, navigation }: Props) {
  const { catId } = route.params;
  const webViewRef = useRef<WebView>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isDonating, setIsDonating] = useState(false);

  const handleDonation = useCallback(
    async (foodItemId: string) => {
      if (isDonating) return;
      setIsDonating(true);
      try {
        await api.post('/donations', { catId, foodItemId });
        Alert.alert('Success', 'Food donated successfully!', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (error) {
        const message =
          error instanceof ApiError && error.serverMessage
            ? error.serverMessage
            : 'Failed to process donation. Please try again.';
        Alert.alert('Error', message);
      } finally {
        setIsDonating(false);
      }
    },
    [catId, isDonating, navigation],
  );

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data: FeedingCompletePayload = JSON.parse(event.nativeEvent.data);
        if (data.type === 'feedingComplete') {
          handleDonation(data.foodItemId);
        }
      } catch {
        // Ignore malformed messages
      }
    },
    [handleDonation],
  );

  const handleLoadEnd = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleLoadError = useCallback(() => {
    setIsLoading(false);
    setLoadError(true);
  }, []);

  const handleFallbackDonate = useCallback(
    (foodItemId: string) => {
      handleDonation(foodItemId);
    },
    [handleDonation],
  );

  if (loadError) {
    return (
      <FallbackDonationScreen
        catId={catId}
        isDonating={isDonating}
        onDonate={handleFallbackDonate}
        onCancel={() => navigation.goBack()}
      />
    );
  }

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading AR experience...</Text>
        </View>
      )}
      <WebView
        ref={webViewRef as any}
        source={{ uri: `${WEBAR_BASE_URL}?catId=${catId}` }}
        style={styles.webView}
        onMessage={handleWebViewMessage}
        onLoadEnd={handleLoadEnd}
        onError={handleLoadError}
        onHttpError={handleLoadError}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
      />
    </View>
  );
}

/**
 * Fallback screen shown when WebAR fails to load.
 * Provides a simple donation confirmation UI.
 */
interface FallbackDonationScreenProps {
  catId: string;
  isDonating: boolean;
  onDonate: (foodItemId: string) => void;
  onCancel: () => void;
}

/** Slice of the GET /food-items response this screen needs (same shape as WalletScreen). */
interface InventoryItem {
  foodItemId: string;
  name: string;
  priceMyr: number;
  quantity: number;
}

interface FoodItemsResponse {
  inventory: InventoryItem[];
}

function FallbackDonationScreen({
  catId,
  isDonating,
  onDonate,
  onCancel,
}: FallbackDonationScreenProps) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [inventoryError, setInventoryError] = useState(false);

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
    fetchInventory();
  }, [fetchInventory]);

  if (loadingInventory) {
    return (
      <View style={styles.fallbackContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.fallbackSubtitle}>Loading your food inventory...</Text>
      </View>
    );
  }

  if (inventoryError) {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackTitle}>Feed This Cat</Text>
        <Text style={styles.fallbackSubtitle}>
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
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (inventory.length === 0) {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackTitle}>Feed This Cat</Text>
        <Text style={styles.fallbackSubtitle}>
          You have no food in your inventory. Purchase food from the Wallet
          screen first, then come back to feed this cat.
        </Text>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Go Back"
        >
          <Text style={styles.cancelButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.fallbackContainer}>
      <Text style={styles.fallbackTitle}>Feed This Cat</Text>
      <Text style={styles.fallbackSubtitle}>
        Choose a food item from your inventory to donate:
      </Text>

      <View style={styles.foodList}>
        {inventory.map((item) => (
          <TouchableOpacity
            key={item.foodItemId}
            style={[
              styles.foodItem,
              selectedItem === item.foodItemId && styles.foodItemSelected,
            ]}
            onPress={() => setSelectedItem(item.foodItemId)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedItem === item.foodItemId }}
            accessibilityLabel={`${item.name}, ${item.quantity} in inventory`}
          >
            <Text style={styles.foodItemName}>{item.name}</Text>
            <Text style={styles.foodItemQuantity}>×{item.quantity}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.donateButton,
          (!selectedItem || isDonating) && styles.donateButtonDisabled,
        ]}
        onPress={() => selectedItem && onDonate(selectedItem)}
        disabled={!selectedItem || isDonating}
        accessibilityRole="button"
        accessibilityLabel="Confirm Donation"
        accessibilityState={{ disabled: !selectedItem || isDonating }}
      >
        {isDonating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.donateButtonText}>Feed Cat</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    color: '#fff',
    fontSize: 16,
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFF8F0',
  },
  fallbackTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  fallbackSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  foodList: {
    width: '100%',
    marginBottom: 24,
  },
  foodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  foodItemSelected: {
    borderColor: '#FF6B6B',
    backgroundColor: '#FFF0F0',
  },
  foodItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  foodItemQuantity: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  donateButton: {
    width: '100%',
    backgroundColor: '#FF6B6B',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  donateButtonDisabled: {
    backgroundColor: '#CCC',
  },
  donateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
  },
});
