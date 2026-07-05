import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { FoodIcon } from '../components/FoodIcons';

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

interface FoodItemsResponse {
  foodItems: FoodItem[];
  inventory: InventoryItem[];
}

interface CheckoutResponse {
  intentId: string;
  paymentUrl: string;
  totalMyr: number;
  items: { foodItemId: string; name: string; priceMyr: number; quantity: number }[];
}

interface PaymentResponse {
  status: 'fulfilled' | 'already_processed';
  intentId: string;
}

// Active discount coupons from GET /gamification/rewards (Requirement 17.12)
interface Coupon {
  id: string;
  amountOffCents: number;
  minPurchaseCents: number;
  expiresAt: string;
  status: 'active' | 'used' | 'expired';
}

// ─── Component ────────────────────────────────────────────────────────────────
//
// Direct checkout (Requirement 10): there is no in-app wallet. The user builds
// a cart, confirms checkout, and pays the exact total through the payment
// gateway. Purchased items land in the inventory once the gateway confirms.

export function ShopScreen() {
  // Food catalogue state
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // Cart state: { foodItemId → quantity }
  const [cart, setCart] = useState<Record<string, number>>({});

  // Inventory state
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);

  // Checkout loading
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Discount coupons (Req 17.12): active coupons, one selectable per checkout
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchFoodItems = useCallback(async () => {
    try {
      const data = await api.get<FoodItemsResponse>('/food-items');
      setFoodItems(data.foodItems);
      setInventory(data.inventory);
    } catch {
      setFoodItems([]);
      setInventory([]);
    } finally {
      setLoadingItems(false);
      setLoadingInventory(false);
    }
  }, []);

  const fetchCoupons = useCallback(async () => {
    try {
      const data = await api.get<{ coupons: Coupon[] }>('/gamification/rewards');
      setCoupons(data.coupons.filter((c) => c.status === 'active'));
    } catch {
      setCoupons([]);
    }
  }, []);

  useEffect(() => {
    fetchFoodItems();
    fetchCoupons();
  }, [fetchFoodItems, fetchCoupons]);

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

  // Coupon eligibility & projected discount (final amounts come from the server)
  const selectedCoupon = coupons.find((c) => c.id === selectedCouponId) ?? null;
  const couponDiscountMyr = selectedCoupon
    ? Math.min(selectedCoupon.amountOffCents / 100, cartTotal)
    : 0;
  const payableTotal = cartTotal - couponDiscountMyr;

  // Deselect a coupon automatically if the cart drops below its minimum
  useEffect(() => {
    if (selectedCoupon && cartTotal < selectedCoupon.minPurchaseCents / 100) {
      setSelectedCouponId(null);
    }
  }, [cartTotal, selectedCoupon]);

  // ─── Checkout Handler ─────────────────────────────────────────────────────

  // SANDBOX: the gateway payment page (paymentUrl) is simulated with a
  // confirmation dialog that triggers the sandbox payment-completion
  // endpoint. In production the paymentUrl opens in an in-app browser and
  // the gateway webhook fulfils the order instead.
  const handleCheckout = async () => {
    if (cartItemCount === 0) {
      Alert.alert('Empty Cart', 'Please add items to your cart first.');
      return;
    }

    const items = Object.entries(cart).map(([foodItemId, quantity]) => ({
      foodItemId,
      quantity,
    }));

    setCheckoutLoading(true);
    try {
      const checkout = await api.post<CheckoutResponse>('/checkout', {
        items,
        ...(selectedCouponId ? { couponId: selectedCouponId } : {}),
      });

      Alert.alert(
        'Confirm Payment',
        `Pay RM ${checkout.totalMyr.toFixed(2)} via the payment gateway (sandbox)?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setCheckoutLoading(false) },
          {
            text: `Pay RM ${checkout.totalMyr.toFixed(2)}`,
            onPress: async () => {
              try {
                await api.post<PaymentResponse>(
                  `/checkout/${checkout.intentId}/simulate-payment`,
                  {},
                );
                setCart({});
                setSelectedCouponId(null);
                // Refresh catalogue + inventory (and consume the coupon)
                fetchFoodItems();
                fetchCoupons();
                Alert.alert('Payment Successful', 'Items added to your inventory!');
              } catch {
                Alert.alert('Payment Failed', 'The payment could not be completed. Please try again.');
              } finally {
                setCheckoutLoading(false);
              }
            },
          },
        ],
        { cancelable: true, onDismiss: () => setCheckoutLoading(false) },
      );
    } catch {
      Alert.alert('Checkout Failed', 'Unable to start checkout. Please try again.');
      setCheckoutLoading(false);
    }
  };

  // ─── Inventory Credit Total ───────────────────────────────────────────────

  const inventoryTotalCredit = inventory.reduce(
    (sum, item) => sum + item.priceMyr * item.quantity,
    0,
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loadingItems) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color="#FF8C00" />
        <Text style={styles.loadingText}>Loading shop...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <ScrollView style={styles.scrollBody} contentContainerStyle={styles.content}>
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Donation Shop</Text>
        <Text style={styles.headerSubtitle}>
          Buy food items and donate them to the cats you care for
        </Text>
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
                <View style={styles.foodIconBadge}>
                  <FoodIcon name={item.name} size={30} />
                </View>
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

      {/* ─── Checkout Section (Req 10.1: items, quantities, total) ──── */}
      {cartItemCount > 0 && (
        <View style={styles.checkoutSection}>
          <Text style={styles.checkoutTitle}>Checkout</Text>
          {Object.entries(cart).map(([itemId, qty]) => {
            const item = foodItems.find((f) => f.id === itemId);
            if (!item) return null;
            return (
              <View key={itemId} style={styles.checkoutRow}>
                <View style={styles.checkoutItemLeft}>
                  <FoodIcon name={item.name} size={18} />
                  <Text style={styles.checkoutItemName}>
                    {item.name} × {qty}
                  </Text>
                </View>
                <Text style={styles.checkoutItemTotal}>
                  RM {(item.priceMyr * qty).toFixed(2)}
                </Text>
              </View>
            );
          })}
          {/* Coupons (Req 17.12): tap to apply one active coupon */}
          {coupons.map((coupon) => {
            const eligible = cartTotal >= coupon.minPurchaseCents / 100;
            const selected = coupon.id === selectedCouponId;
            return (
              <TouchableOpacity
                key={coupon.id}
                style={styles.checkoutRow}
                disabled={!eligible}
                onPress={() => setSelectedCouponId(selected ? null : coupon.id)}
                accessibilityLabel={`Coupon RM ${(coupon.amountOffCents / 100).toFixed(0)} off`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: !eligible }}
              >
                <View style={styles.checkoutItemLeft}>
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={eligible ? '#FF6B35' : '#BDBDBD'}
                  />
                  <Text
                    style={[styles.checkoutItemName, !eligible && styles.couponIneligible]}
                  >
                    RM{(coupon.amountOffCents / 100).toFixed(0)} off
                    {eligible
                      ? ''
                      : ` (min RM${(coupon.minPurchaseCents / 100).toFixed(0)})`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {selectedCoupon && (
            <View style={styles.checkoutRow}>
              <Text style={styles.checkoutItemName}>Coupon discount</Text>
              <Text style={styles.checkoutItemTotal}>
                −RM {couponDiscountMyr.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={styles.checkoutTotalRow}>
            <Text style={styles.checkoutTotalLabel}>Total</Text>
            <Text style={styles.checkoutTotalAmount}>
              RM {payableTotal.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.checkoutButton, checkoutLoading && styles.buttonDisabled]}
            onPress={handleCheckout}
            disabled={checkoutLoading}
            accessibilityLabel={`Pay RM ${payableTotal.toFixed(2)}`}
            accessibilityRole="button"
          >
            {checkoutLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.checkoutButtonText}>
                Pay RM {payableTotal.toFixed(2)}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Inventory Section (Req 10.4: total credit value) ───────── */}
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
                <FoodIcon name={item.name} size={22} />
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
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  scrollBody: {
    flex: 1,
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

  // Header card
  headerCard: {
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
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.9,
    marginTop: 6,
    textAlign: 'center',
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

  // Food items
  foodItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  foodIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF3E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
    alignItems: 'center',
    paddingVertical: 4,
  },
  checkoutItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkoutItemName: {
    fontSize: 14,
    color: '#555',
  },
  couponIneligible: {
    color: '#BDBDBD',
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
  checkoutButton: {
    backgroundColor: '#FF8C00',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  checkoutButtonText: {
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
    marginLeft: 10,
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
