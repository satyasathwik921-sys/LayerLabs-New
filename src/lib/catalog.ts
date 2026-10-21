import { supabaseRequest, isSupabaseConfigured } from "./supabase";
import type { Product, StoreCatalog } from "../types";

export const FALLBACK_CATALOG: StoreCatalog = {
  products: [
    {
      id: "prod-410700",
      name: "Space X Raptor 3 Rocket Engine",
      category: "3d-print",
      productType: "physical-3d-print",
      price: 2599,
      salePrice: 2399,
      stock: 4,
      status: "published",
      featured: true,
      description: "A detailed FDM-printed rocket engine display model.",
      images: ["https://images.unsplash.com/photo-1517976487492-5750f3195933?auto=format&fit=crop&w=1000&q=85"],
      variants: { colors: ["Matte Black", "Industrial Grey"], materials: ["PLA Pro", "PETG-CF", "ABS"] },
    },
    {
      id: "prod-749040",
      name: "B1 Lancer",
      category: "3d-print",
      productType: "physical-3d-print",
      price: 3199,
      salePrice: 2899,
      stock: 2,
      status: "published",
      featured: true,
      description: "Precision display model made to order.",
      images: ["https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=85"],
      variants: { colors: ["Matte Black", "Industrial Grey", "Signal Orange"], materials: ["PLA Pro", "PETG"] },
    },
    {
      id: "prod-813735",
      name: "SR-71 Black Bird Model",
      category: "3d-print",
      productType: "physical-3d-print",
      price: 1199,
      salePrice: 999,
      stock: 4,
      status: "published",
      featured: true,
      description: "An aircraft-inspired engineering desk model.",
      images: ["https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1000&q=85"],
      variants: { colors: ["Matte Black", "Graphite Grey"], materials: ["PLA Pro", "ABS"] },
    },
    {
      id: "draft-mw-1201435",
      name: "4-Speed Manual Transmission (multi colour)",
      category: "3d-print",
      productType: "physical-3d-print",
      price: 2199,
      salePrice: 1799,
      stock: 2,
      status: "published",
      description: "A multi-colour mechanical transmission model.",
      images: ["https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=1000&q=85"],
      variants: { colors: ["Matte Black", "Industrial Grey", "Signal Orange", "Ivory"], materials: ["PLA Pro", "PETG"] },
    },
    {
      id: "draft-mw-483878",
      name: "2-Stroke IC Engine",
      category: "3d-print",
      productType: "physical-3d-print",
      price: 1799,
      salePrice: 1599,
      stock: 3,
      status: "published",
      description: "A cutaway-inspired two-stroke engine model.",
      images: ["https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=1000&q=85"],
      variants: { colors: ["Matte Black", "Industrial Grey"], materials: ["PLA Pro", "ABS"] },
    },
    {
      id: "draft-mw-1270878",
      name: "V8 Engine Model",
      category: "3d-print",
      productType: "physical-3d-print",
      price: 2799,
      salePrice: 2599,
      stock: 5,
      status: "published",
      description: "A compact V8-inspired educational model.",
      images: ["https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=1000&q=85"],
      variants: { colors: ["Matte Black", "Industrial Grey"], materials: ["PLA Pro", "PETG"] },
    },
    {
      id: "draft-mw-13806",
      name: "Mini TurboFan Jet Engine",
      category: "3d-print",
      productType: "physical-3d-print",
      price: 399,
      salePrice: 349,
      stock: 4,
      status: "published",
      description: "A small turbine-inspired desk model.",
      images: ["https://images.unsplash.com/photo-1517976487492-5750f3195933?auto=format&fit=crop&w=1000&q=85"],
      variants: { colors: ["Matte Black", "Signal Orange"], materials: ["PLA Pro"] },
    },
  ],
  categories: [
    { id: "3d-print", name: "3D Printed Products", enabled: true, order: 1 },
    { id: "custom-print", name: "Custom 3D Printing", enabled: true, order: 2 },
    { id: "cad-design", name: "Mechanical CAD", enabled: true, order: 3 },
  ],
  promotions: [
    { id: "promo-first-order-10", code: "FIRST10", title: "First Order", discountType: "percentage", discountValue: 10, minOrderSubtotal: 500, maxDiscountAmount: 500, targetType: "first-order", isActive: true, perCustomerLimit: 1 },
  ],
  pricing: {
    configuredUpiId: "7989064266@ybl",
    shippingCharge: 89,
    minimumOrderValue: 500,
    firstOrderDiscount: 10,
    referralDiscount: 25,
    packagingCost: 30,
    plaRatePerGram: 7,
    machineRatePerHour: 76,
    businessEmail: "layerlabs2021@gmail.com",
    whatsappNumber: "+917989064266",
  },
  shippingSettings: {
    defaultShippingCharge: 89,
    freeShippingEnabled: false,
    freeShippingThreshold: 2999,
    estimatedDeliveryMessage: "Dispatched via India Post Speed Post nationwide (3–5 business days).",
    options: [
      { id: "local-pickup", name: "Studio Lab Pickup (Hyderabad)", price: 0, enabled: true, isDefault: true, estimatedDelivery: "Same-day after fabrication" },
      { id: "ship-2161", name: "SpeedPost (Telengana)", price: 89, enabled: true, estimatedDelivery: "3–5 business days" },
    ],
  },
};

function mergeCatalog(value: Partial<StoreCatalog> | null | undefined): StoreCatalog {
  const fallback = FALLBACK_CATALOG;
  const products = Array.isArray(value?.products) ? value.products as Product[] : fallback.products;
  return {
    ...fallback,
    ...value,
    products,
    categories: Array.isArray(value?.categories) ? value.categories : fallback.categories,
    promotions: Array.isArray(value?.promotions) ? value.promotions : fallback.promotions,
    pricing: { ...fallback.pricing, ...(value?.pricing ?? {}) },
    shippingSettings: {
      ...fallback.shippingSettings,
      ...(value?.shippingSettings ?? {}),
      options: Array.isArray(value?.shippingSettings?.options)
        ? value!.shippingSettings!.options
        : fallback.shippingSettings.options,
    },
  };
}

export async function loadCatalog(signal?: AbortSignal): Promise<{ catalog: StoreCatalog; isLive: boolean }> {
  if (!isSupabaseConfigured()) return { catalog: FALLBACK_CATALOG, isLive: false };
  try {
    const rows = await supabaseRequest<{ id: number; catalog: Partial<StoreCatalog> }[]>(
      "/rest/v1/store_catalog?select=id,catalog&id=eq.1&limit=1",
      { signal },
    );
    if (!rows?.length || !rows[0].catalog) throw new Error("The shared catalogue is empty.");
    return { catalog: mergeCatalog(rows[0].catalog), isLive: true };
  } catch (error) {
    console.error("Unable to load shared LayerLabs catalogue.", error);
    return { catalog: FALLBACK_CATALOG, isLive: false };
  }
}

export function liveProducts(catalog: StoreCatalog): Product[] {
  return catalog.products.filter((product) =>
    product.status !== "archived" && product.status !== "draft" && product.status !== "unpublished"
  );
}