export type ProductVariantSet = {
  colors?: string[];
  materials?: string[];
};

export type Product = {
  id: string;
  sku?: string;
  slug?: string;
  name: string;
  category: string;
  productType?: string;
  isDigital?: boolean;
  price: number;
  salePrice?: number | null;
  stock?: number;
  availability?: string;
  status?: string;
  description?: string;
  longDescription?: string;
  images?: string[];
  imageUrl?: string;
  featured?: boolean;
  tags?: string[];
  variants?: ProductVariantSet;
  specs?: Record<string, string>;
};

export type ShippingOption = {
  id: string;
  name: string;
  price: number;
  enabled: boolean;
  isDefault?: boolean;
  estimatedDelivery?: string;
};

export type PricingSettings = {
  configuredUpiId: string;
  shippingCharge: number;
  minimumOrderValue: number;
  firstOrderDiscount: number;
  referralDiscount: number;
  packagingCost: number;
  plaRatePerGram: number;
  machineRatePerHour: number;
  businessEmail: string;
  whatsappNumber: string;
};

export type StoreCatalog = {
  products: Product[];
  categories: { id: string; name: string; enabled?: boolean; order?: number }[];
  promotions: {
    id: string;
    code: string;
    title: string;
    description?: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    minOrderSubtotal?: number;
    maxDiscountAmount?: number;
    targetType?: string;
    isActive?: boolean;
    requiresThresholdConfig?: boolean;
    perCustomerLimit?: number;
    usageLimit?: number;
  }[];
  pricing: PricingSettings;
  shippingSettings: {
    defaultShippingCharge: number;
    freeShippingEnabled?: boolean;
    freeShippingThreshold?: number;
    options: ShippingOption[];
    estimatedDeliveryMessage?: string;
  };
  websiteSections?: unknown[];
  contentSettings?: Record<string, unknown>;
};

export type CartLine = {
  product: Product;
  quantity: number;
  selectedColor?: string;
  selectedMaterial?: string;
};

export type StoreOrder = {
  id?: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  shipping_address?: Record<string, string>;
  items: CartLine[];
  subtotal: number;
  discount: number;
  discount_code_applied?: string | null;
  shipping_cost: number;
  total_amount: number;
  payment_method: string;
  upi_reference_number?: string;
  status: string;
  created_at: string;
  verified_at?: string | null;
  verified_by?: string | null;
  rejection_reason?: string | null;
  courier_name?: string | null;
  fulfillment_method?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  cancellation_reason?: string | null;
  delivery_option_id?: string;
  delivery_option_name?: string;
  refund_status?: string;
  refund_note?: string | null;
};

export const formatINR = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

export const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};