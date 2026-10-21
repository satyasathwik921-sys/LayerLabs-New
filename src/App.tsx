import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  getAdminSession, isSupabaseConfigured, loginAdmin, logoutAdmin, supabaseRequest,
  SupabaseError, type AdminSession,
} from "./lib/supabase";
import { FALLBACK_CATALOG, liveProducts, loadCatalog } from "./lib/catalog";
import type { CartLine, Product, StoreCatalog, StoreOrder } from "./types";
import { formatDate, formatINR } from "./types";

type View = "home" | "products" | "product" | "cart" | "checkout" | "track" | "custom" | "policies" | "about" | "admin";
const routeTable: Record<string, View> = {
  "/": "home", "/products": "products", "/3d-prints": "products", "/cart": "cart",
  "/checkout": "checkout", "/track-order": "track", "/custom-print": "custom",
  "/policies": "policies", "/about": "about", "/admin": "admin",
};
const pathFor: Record<View, string> = {
  home: "/", products: "/products", product: "/products", cart: "/cart",
  checkout: "/checkout", track: "/track-order", custom: "/custom-print",
  policies: "/policies", about: "/about", admin: "/admin",
};
const getRoute = (): View => routeTable[window.location.pathname] || (window.location.pathname.startsWith("/product/") ? "product" : "home");
const goTo = (path: string) => {
  if (window.location.pathname !== path) window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
};
const isDigital = (product: Product) =>
  product.isDigital === true || ["digital", "digital-model", "digital-download"].includes((product.productType || "").toLowerCase());
const newOrderId = () =>
  "ORD-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
const safeExternal = (url?: string) => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : undefined;
  } catch { return undefined; }
};

function Link({ to, children, className = "", onClick }: {
  to: string; children: React.ReactNode; className?: string; onClick?: () => void;
}) {
  return <a href={to} className={className} onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onClick?.();
    goTo(to);
  }}>{children}</a>;
}

function Brand() {
  return <Link to="/" className="brand" aria-label="LayerLabs home">
    <span className="brand-mark" aria-hidden="true"><span /></span>
    <span className="brand-name">layerlabs<span>INDUSTRIAL DESIGN · DIGITAL FABRICATION</span></span>
  </Link>;
}

function Header({ cartCount }: { cartCount: number }) {
  return <>
    <div className="topline"><span>Engineering, made tangible.</span><span>FDM 3D Printing · Mechanical CAD · Prototyping</span></div>
    <header className="site-header">
      <Brand />
      <nav className="desktop-nav" aria-label="Primary navigation">
        <Link to="/products">Products</Link>
        <Link to="/custom-print">Custom printing</Link>
        <Link to="/about">Studio</Link>
        <Link to="/policies">Policies</Link>
      </nav>
      <div className="header-actions">
        <Link to="/track-order" className="track-link">Track order</Link>
        <Link to="/cart" className="cart-link" aria-label={"Cart, " + cartCount + " items"}>Bag <span>{cartCount}</span></Link>
        <Link to="/admin" className="admin-link" aria-label="Administrator portal">↗</Link>
      </div>
    </header>
  </>;
}

function Footer() {
  return <footer className="site-footer">
    <div className="footer-top">
      <div><Brand /><p className="footer-copy">Useful objects, carefully engineered.<br />From the digital model to the physical part.</p></div>
      <div><span className="footer-label">Explore</span><Link to="/products">Product catalogue</Link><Link to="/custom-print">Custom 3D printing</Link><Link to="/about">Studio & capabilities</Link></div>
      <div><span className="footer-label">Support</span><Link to="/track-order">Order tracking</Link><Link to="/policies">Shipping & refunds</Link><a href="mailto:layerlabs2021@gmail.com">Contact the studio</a></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} LayerLabs</span><span>Designed for curious minds and real-world use.</span></div>
  </footer>;
}

function PageIntro({ eyebrow, title, description, compact = false }: {
  eyebrow: string; title: string; description: string; compact?: boolean;
}) {
  return <div className={"page-intro" + (compact ? " compact" : "")}>
    <span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p>
  </div>;
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product, color?: string, material?: string) => void }) {
  const colors = product.variants?.colors?.filter(Boolean) || [];
  const materials = product.variants?.materials?.filter(Boolean) || [];
  const [color, setColor] = useState(colors[0] || "");
  const [material, setMaterial] = useState(materials[0] || "");
  useEffect(() => { setColor(colors[0] || ""); setMaterial(materials[0] || ""); }, [product.id]);
  const image = safeExternal(product.images?.[0] || product.imageUrl);
  const price = product.salePrice ?? product.price;
  const canBuy = product.status !== "archived" && product.status !== "draft" && (product.stock === undefined || product.stock > 0);
  return <article className="product-card">
    <Link to={"/product/" + encodeURIComponent(product.slug || product.id)} className="product-image-wrap">
      {image ? <img className="product-image" src={image} alt={product.name} loading="lazy" onError={(event) => {
        event.currentTarget.style.display = "none";
        event.currentTarget.parentElement?.classList.add("image-failed");
      }} /> : null}
      <span className="image-index">LL / {product.sku || product.id.slice(0, 8).toUpperCase()}</span>
      {product.salePrice && product.salePrice < product.price ? <span className="product-badge">Studio price</span> : null}
      <span className="image-arrow" aria-hidden="true">↗</span>
    </Link>
    <div className="product-info">
      <div className="product-card-title"><Link to={"/product/" + encodeURIComponent(product.slug || product.id)}><h3>{product.name}</h3></Link><span className="stock-note">{product.stock !== undefined && product.stock <= 4 ? "Limited run" : "Made to order"}</span></div>
      <p>{product.description || "A considered engineering object, printed and finished by LayerLabs."}</p>
      {(colors.length > 0 || materials.length > 0) && <div className="variant-pickers">
        {colors.length > 0 && <label>Colour<select value={color} onChange={(e) => setColor(e.target.value)} aria-label={"Choose colour for " + product.name}>
          {colors.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select></label>}
        {materials.length > 0 && <label>Material<select value={material} onChange={(e) => setMaterial(e.target.value)} aria-label={"Choose material for " + product.name}>
          {materials.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select></label>}
      </div>}
      <div className="product-buy-row"><div className="price-stack"><strong>{formatINR(price)}</strong>{product.salePrice && product.salePrice < product.price && <del>{formatINR(product.price)}</del>}</div>
        <button className="add-button" disabled={!canBuy} onClick={() => onAdd(product, color || undefined, material || undefined)}>{canBuy ? "Add to bag" : "Out of stock"} <span>+</span></button>
      </div>
    </div>
  </article>;
}

function CartView({ cart, catalog, updateLine, removeLine }: {
  cart: CartLine[]; catalog: StoreCatalog;
  updateLine: (key: string, delta: number) => void; removeLine: (key: string) => void;
}) {
  const subtotal = cart.reduce((sum, line) => sum + Number(line.product.salePrice ?? line.product.price) * line.quantity, 0);
  const key = (line: CartLine) => [line.product.id, line.selectedColor || "", line.selectedMaterial || ""].join("::");
  return <main className="page-shell">
    <PageIntro eyebrow="Your selection" title="The bag." description="Review your selected parts, colourways and materials before checkout." compact />
    {cart.length === 0 ? <div className="empty-state"><span className="empty-glyph">□</span><h2>Nothing in the bag yet.</h2><p>Browse the catalogue to find something worth making.</p><Link to="/products" className="button-primary">Explore products ↗</Link></div> :
      <div className="cart-layout"><div className="cart-lines">{cart.map((line) => <div className="cart-line" key={key(line)}>
        <div className="cart-thumbnail">{safeExternal(line.product.images?.[0] || line.product.imageUrl) && <img src={line.product.images?.[0] || line.product.imageUrl} alt="" />}</div>
        <div className="cart-line-detail"><h3>{line.product.name}</h3><div className="cart-meta">{line.selectedColor && <span>Colour: {line.selectedColor}</span>}{line.selectedMaterial && <span>Material: {line.selectedMaterial}</span>}</div><strong>{formatINR(Number(line.product.salePrice ?? line.product.price) * line.quantity)}</strong>
          <div className="quantity-control"><button onClick={() => updateLine(key(line), -1)} aria-label="Decrease quantity">−</button><span>{line.quantity}</span><button onClick={() => updateLine(key(line), 1)} aria-label="Increase quantity">+</button><button className="remove-line" onClick={() => removeLine(key(line))}>Remove</button></div>
        </div>
      </div>)}</div>
        <aside className="summary-card"><span className="eyebrow">Order estimate</span><div className="summary-row"><span>Merchandise</span><strong>{formatINR(subtotal)}</strong></div><div className="summary-row"><span>Shipping</span><span>Calculated at checkout</span></div><div className="summary-total"><span>Estimated total</span><strong>{formatINR(subtotal)}</strong></div><p className="muted small">The server rechecks each published price, discount and shipping option when the order is saved.</p><Link to="/checkout" className="button-primary full">Continue to checkout ↗</Link><Link to="/products" className="text-link">Continue browsing</Link></aside>
      </div>}
  </main>;
}

function CheckoutView({ cart, catalog, catalogIsLive, onOrderCreated, clearCart }: {
  cart: CartLine[]; catalog: StoreCatalog; catalogIsLive: boolean;
  onOrderCreated: (order: StoreOrder) => void; clearCart: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const enabledDelivery = catalog.shippingSettings.options.filter((o) => o.enabled);
  const defaultDelivery = enabledDelivery.find((o) => o.isDefault) || enabledDelivery[0];
  const [deliveryId, setDeliveryId] = useState(defaultDelivery?.id || "");
  const [utr, setUtr] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const subtotal = cart.reduce((sum, line) => sum + Number(line.product.salePrice ?? line.product.price) * line.quantity, 0);
  const onlyDigital = cart.length > 0 && cart.every((line) => isDigital(line.product));
  const chosenDelivery = enabledDelivery.find((o) => o.id === deliveryId) || defaultDelivery;
  const promotion = catalog.promotions.find((p) => p.code.toUpperCase() === coupon.trim().toUpperCase() && p.isActive);
  const discount = promotion && subtotal >= Number(promotion.minOrderSubtotal || 0) && !promotion.requiresThresholdConfig
    ? Math.min(subtotal, promotion.discountType === "percentage"
      ? Math.min(Math.round(subtotal * promotion.discountValue / 100), promotion.maxDiscountAmount || subtotal)
      : promotion.discountValue)
    : 0;
  const shipping = onlyDigital ? 0 :
    catalog.shippingSettings.freeShippingEnabled && subtotal >= Number(catalog.shippingSettings.freeShippingThreshold || 0)
      ? 0 : Number(chosenDelivery?.price ?? catalog.shippingSettings.defaultShippingCharge ?? catalog.pricing.shippingCharge);
  const total = Math.max(0, subtotal - discount) + shipping;
  const upiUri = "upi://pay?pa=" + encodeURIComponent(catalog.pricing.configuredUpiId) +
    "&pn=" + encodeURIComponent("LayerLabs") + "&am=" + total.toFixed(2) + "&cu=INR&tn=" + encodeURIComponent("LayerLabs order");
  const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=4&data=" + encodeURIComponent(upiUri);
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => { if (defaultDelivery && !enabledDelivery.some((o) => o.id === deliveryId)) setDeliveryId(defaultDelivery.id); }, [catalog.shippingSettings.options.length]);

  function applyCoupon() {
    if (!coupon.trim()) { setCouponMessage("Enter a code to apply it."); return; }
    if (!promotion) { setCouponMessage("That code is not active. Check the code or continue without a discount."); return; }
    if (subtotal < Number(promotion.minOrderSubtotal || 0)) { setCouponMessage("This code needs a merchandise subtotal of " + formatINR(Number(promotion.minOrderSubtotal)) + "."); return; }
    if (promotion.requiresThresholdConfig) { setCouponMessage("This campaign is not fully configured for checkout."); return; }
    setCouponMessage("Code applied. Final eligibility and discount are validated by the order service.");
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (!cart.length) { setError("Your bag is empty."); return; }
    if (!isSupabaseConfigured() || !catalogIsLive) { setError("Live checkout is not available because this deployment cannot reach the shared LayerLabs catalogue. No order has been placed."); return; }
    if (!name.trim() || !email.trim() || !phone.trim() || !utr.trim()) { setError("Complete your contact details and transaction reference."); return; }
    if (!onlyDigital && (!address.trim() || !city.trim() || !state.trim() || !pincode.trim())) { setError("Complete the delivery address or choose studio collection."); return; }
    if (!/^[0-9A-Za-z]{8,22}$/.test(utr.trim().replace(/\s+/g, ""))) { setError("Enter the UPI transaction reference (8–22 letters or numbers)."); return; }
    if (!onlyDigital && !chosenDelivery) { setError("Choose one of the available delivery options."); return; }
    setBusy(true);
    try {
      const id = newOrderId();
      const requestBody = {
        order_number: id,
        customer_name: name.trim(),
        customer_email: email.trim().toLowerCase(),
        customer_phone: phone.trim(),
        shipping_address: onlyDigital ? { address: "Digital fulfillment", city: "", state: "", pincode: "" } : {
          address: address.trim(), city: city.trim(), state: state.trim(), pincode: pincode.trim(),
        },
        items: cart.map((line, index) => ({
          id: "line-" + (index + 1) + "-" + line.product.id,
          product: line.product,
          quantity: line.quantity,
          selectedColor: line.selectedColor,
          selectedMaterial: line.selectedMaterial,
        })),
        subtotal, discount, discount_code_applied: discount ? coupon.trim().toUpperCase() : null,
        shipping_cost: shipping, total_amount: total, payment_method: "MANUAL_UPI",
        upi_reference_number: utr.trim().replace(/\s+/g, ""),
        status: "PAYMENT_PENDING", refund_status: "NOT_REQUESTED",
        delivery_option_id: onlyDigital ? "digital" : chosenDelivery!.id,
        delivery_option_name: onlyDigital ? "Digital fulfillment" : chosenDelivery!.name,
      };
      const returned = await supabaseRequest<StoreOrder[] | StoreOrder>("/rest/v1/store_orders?select=*", {
        method: "POST", body: requestBody, prefer: "return=representation",
      });
      const created = Array.isArray(returned) ? returned[0] : returned;
      if (!created?.order_number) throw new Error("The order service did not return a saved order. Do not pay again; contact LayerLabs with your transaction reference.");
      clearCart();
      onOrderCreated(created);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to save this order.";
      setError(message + " If you have already paid, do not pay again; contact LayerLabs with your transaction reference.");
    } finally { setBusy(false); }
  }

  if (cart.length === 0) return <main className="page-shell"><PageIntro eyebrow="Checkout" title="The bag is empty." description="Add an item before starting checkout." compact /><div className="empty-state"><Link to="/products" className="button-primary">Return to products ↗</Link></div></main>;

  return <main className="page-shell">
    <PageIntro eyebrow="Secure checkout" title="Complete your order." description="Pay directly via UPI and submit the bank transaction reference. Every order remains pending until a LayerLabs administrator verifies receipt." compact />
    {!catalogIsLive && <div className="notice notice-warning"><strong>Live catalogue unavailable.</strong> You can view the fallback catalogue, but placing a real order is disabled until this deployment has working Supabase configuration.</div>}
    <form className="checkout-layout" onSubmit={submit}>
      <div className="checkout-steps">
        <section className="form-panel"><span className="step-label">01 / Contact</span><h2>Who is this for?</h2><div className="form-grid">
          <label>Full name<input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label>Email address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <label>Phone number<input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></label>
        </div></section>
        {!onlyDigital && <section className="form-panel"><span className="step-label">02 / Delivery</span><h2>Where should it go?</h2><div className="form-grid">
          <label className="span-two">Address<input required value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" /></label>
          <label>City<input required value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" /></label>
          <label>State<input required value={state} onChange={(e) => setState(e.target.value)} autoComplete="address-level1" /></label>
          <label>PIN code<input required inputMode="numeric" value={pincode} onChange={(e) => setPincode(e.target.value)} autoComplete="postal-code" maxLength={10} /></label>
        </div>
        <div className="delivery-options"><span className="field-heading">Delivery option</span>
          {enabledDelivery.map((option) => <label className={"delivery-option" + (deliveryId === option.id ? " selected" : "")} key={option.id}>
            <input type="radio" name="delivery" value={option.id} checked={deliveryId === option.id} onChange={() => setDeliveryId(option.id)} />
            <span className="delivery-option-copy"><strong>{option.name}</strong><small>{option.estimatedDelivery || "Delivery estimate provided after fabrication"}</small></span>
            <b>{option.price === 0 ? "Free" : formatINR(option.price)}</b>
          </label>)}
          {enabledDelivery.length === 0 && <p className="muted small">No delivery choices are published. Please contact LayerLabs before paying.</p>}
        </div></section>}
        <section className="form-panel"><span className="step-label">{onlyDigital ? "02" : "03"} / UPI payment</span><h2>Pay directly to LayerLabs.</h2>
          <div className="payment-block">
            <div className="qr-panel">{!qrFailed ? <img src={qrUrl} alt="UPI QR code for the current checkout estimate" onError={() => setQrFailed(true)} /> :
              <div className="qr-fallback"><span>UPI</span><small>QR unavailable — use the UPI ID shown here.</small></div>}
              <span className="qr-caption">Scan with your UPI app</span>
            </div>
            <div className="payment-instructions"><span className="eyebrow">PAY EXACTLY</span><strong className="pay-amount">{formatINR(total)}</strong>
              <p>Check the payee and amount in your banking app before confirming the transfer.</p>
              <span className="field-heading">LayerLabs UPI ID</span><code className="upi-id">{catalog.pricing.configuredUpiId}</code>
              <div className="inline-actions"><a className="button-secondary" href={upiUri}>Open UPI app ↗</a><button className="text-link" type="button" onClick={() => { void navigator.clipboard?.writeText(catalog.pricing.configuredUpiId); }}>Copy UPI ID</button></div>
            </div>
          </div>
          <label>Bank transaction reference (UTR)<input required value={utr} onChange={(e) => setUtr(e.target.value)} autoComplete="off" maxLength={22} placeholder="Enter your bank reference" /></label>
          <p className="muted small">A UTR is not proof of payment. The order remains pending until the payment is reconciled with bank records. Never share a UPI PIN or OTP.</p>
        </section>
        <section className="form-panel"><span className="step-label">{onlyDigital ? "03" : "04"} / Promotion</span><h2>Have a code?</h2><div className="coupon-entry"><input aria-label="Promotion code" value={coupon} onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setCouponMessage(""); }} placeholder="e.g. FIRST10" /><button type="button" className="button-secondary" onClick={applyCoupon}>Apply code</button></div>{couponMessage && <p className="coupon-message">{couponMessage}</p>}</section>
        {error && <div role="alert" className="notice notice-error">{error}</div>}
        <button className="button-primary full submit-order" type="submit" disabled={busy || !catalogIsLive}>{busy ? "Saving order…" : "Place order · " + formatINR(total) + " ↗"}</button>
        <p className="muted small fineprint">Your order is saved only after the shared database confirms it. Do not submit the same transaction reference for multiple orders.</p>
      </div>
      <aside className="summary-card checkout-summary"><span className="eyebrow">Order summary</span>{cart.map((line) => <div className="summary-product" key={[line.product.id,line.selectedColor,line.selectedMaterial].join("/")}>
        <div><strong>{line.product.name}</strong><small>{line.quantity} × {formatINR(Number(line.product.salePrice ?? line.product.price))}{line.selectedColor ? " · " + line.selectedColor : ""}{line.selectedMaterial ? " · " + line.selectedMaterial : ""}</small></div>
        <b>{formatINR(Number(line.product.salePrice ?? line.product.price) * line.quantity)}</b>
      </div>)}<div className="summary-row"><span>Subtotal</span><strong>{formatINR(subtotal)}</strong></div>{discount > 0 && <div className="summary-row discount-row"><span>{coupon.toUpperCase()}</span><strong>−{formatINR(discount)}</strong></div>}<div className="summary-row"><span>{onlyDigital ? "Digital fulfillment" : chosenDelivery?.name || "Delivery"}</span><strong>{shipping === 0 ? "Free" : formatINR(shipping)}</strong></div><div className="summary-total"><span>Estimated total</span><strong>{formatINR(total)}</strong></div><div className="trust-note"><span>✓</span><p>Price, shipping and promotion eligibility are revalidated against the shared catalogue when the order is saved.</p></div></aside>
    </form>
  </main>;
}

function OrderStatus({ status }: { status: string }) {
  const normalized = (status || "UNKNOWN").toUpperCase();
  const tone = normalized.includes("REJECT") || normalized.includes("CANCEL") ? "danger" :
    normalized.includes("PENDING") || normalized.includes("REQUESTED") ? "warning" :
    normalized.includes("VERIFIED") || normalized.includes("DELIVERED") ? "success" : "neutral";
  return <span className={"status-pill " + tone}>{normalized.replaceAll("_", " ")}</span>;
}

function OrderDetails({ order, onCancel }: { order: StoreOrder; onCancel?: () => void }) {
  const canCancel = ["PAYMENT_PENDING", "NEW", "PAYMENT_VERIFIED"].includes((order.status || "").toUpperCase());
  return <section className="order-result">
    <div className="order-result-head"><div><span className="eyebrow">Order reference</span><h2>{order.order_number}</h2></div><OrderStatus status={order.status} /></div>
    <div className="order-result-grid"><div><span>Submitted</span><strong>{formatDate(order.created_at)}</strong></div><div><span>Total recorded</span><strong>{formatINR(order.total_amount)}</strong></div><div><span>Delivery</span><strong>{order.delivery_option_name || "Digital fulfillment"}</strong></div></div>
    <h3>Items</h3>{(order.items || []).map((line, index) => <div className="order-item" key={line.product.id + "-" + index}><div><strong>{line.product.name}</strong><small>{line.quantity} × {formatINR(Number(line.product.salePrice ?? line.product.price))}{line.selectedColor ? " · " + line.selectedColor : ""}{line.selectedMaterial ? " · " + line.selectedMaterial : ""}</small></div></div>)}
    {order.rejection_reason && <div className="notice notice-warning">Payment review note: {order.rejection_reason}</div>}
    {order.tracking_number && <div className="notice"><strong>Tracking number:</strong> {order.tracking_number}{order.courier_name ? " · " + order.courier_name : ""}{safeExternal(order.tracking_url) && <p><a href={safeExternal(order.tracking_url)} target="_blank" rel="noreferrer">Track shipment ↗</a></p>}</div>}
    {order.refund_status && order.refund_status !== "NOT_REQUESTED" && <div className="notice notice-warning"><strong>Refund status:</strong> {order.refund_status.replaceAll("_", " ")}<p>{order.refund_note || "Refunds are reviewed and processed manually; this status is not proof that money has been transferred."}</p></div>}
    {canCancel && onCancel && <div className="order-result-actions"><button className="button-secondary danger-button" onClick={onCancel}>Request cancellation</button></div>}
    <p className="muted small">Payment verification and any refund are handled manually by LayerLabs. Use the same checkout email to access this order.</p>
  </section>;
}

function TrackView() {
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("I would like to cancel this order.");
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function lookup(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError(""); setMessage(""); setOrder(null);
    try {
      const result = await supabaseRequest<StoreOrder | null>("/rest/v1/rpc/lookup_store_order", {
        method: "POST", body: { p_order_number: orderId.trim().toUpperCase(), p_customer_email: email.trim().toLowerCase() },
      });
      if (!result) throw new Error("We could not find an order matching that ID and checkout email.");
      setOrder(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Order lookup failed."); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!order) return;
    if (!window.confirm("Request cancellation for " + order.order_number + "? Any refund is reviewed manually and is not automatic.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await supabaseRequest<{ success: boolean; message: string }>("/rest/v1/rpc/request_store_order_cancellation", {
        method: "POST", body: { p_order_number: order.order_number, p_customer_email: email.trim().toLowerCase(), p_reason: reason },
      });
      if (!result?.success) throw new Error(result?.message || "Cancellation could not be recorded.");
      setMessage(result.message);
      await lookup();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Cancellation could not be recorded."); }
    finally { setBusy(false); }
  }

  return <main className="page-shell">
    <PageIntro eyebrow="Order support" title="Know where it stands." description="Enter the order reference and the exact email used at checkout. We show only customer-facing order information." compact />
    <form className="lookup-panel" onSubmit={lookup}><label>Order reference<input required value={orderId} onChange={(e) => setOrderId(e.target.value.toUpperCase())} placeholder="ORD-XXXX-AB12" /></label><label>Checkout email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><button className="button-primary" type="submit" disabled={busy}>{busy ? "Searching…" : "Find order ↗"}</button></form>
    {error && <div role="alert" className="notice notice-error">{error}</div>}{message && <div className="notice notice-success">{message}</div>}
    {order && <><OrderDetails order={order} onCancel={["PAYMENT_PENDING", "NEW", "PAYMENT_VERIFIED"].includes(order.status) ? cancel : undefined} />{["PAYMENT_PENDING", "NEW", "PAYMENT_VERIFIED"].includes(order.status) && <div className="cancel-reason-panel"><label>Cancellation reason<textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} /></label><span className="muted small">Cancellation requests are recorded on the matching order. Any refund requires a separate manual review.</span></div>}</>}
  </main>;
}

function CustomPrintView({ catalog }: { catalog: StoreCatalog }) {
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [material, setMaterial] = useState("PLA Pro");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [validFile, setValidFile] = useState(false);
  const allowed = [".stl", ".step", ".stp", ".obj", ".3mf"];
  function acceptFile(file?: File) {
    setError(""); setValidFile(false);
    if (!file) { setFileName(""); setFileSize(0); return; }
    const extension = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!allowed.includes(extension)) { setError("Use a supported model format: STL, STEP, STP, OBJ or 3MF."); setFileName(""); return; }
    if (file.size > 150 * 1024 * 1024) { setError("The selected file exceeds the 150 MB browser limit."); setFileName(""); return; }
    if (!file.size) { setError("The selected file is empty."); setFileName(""); return; }
    setFileName(file.name); setFileSize(file.size); setValidFile(true);
  }
  function openRequest(event: FormEvent) {
    event.preventDefault();
    if (!validFile) { setError("Choose a valid model file before continuing."); return; }
    const message = [
      "LayerLabs custom 3D print quote request",
      "File: " + fileName,
      "Size: " + (fileSize / (1024 * 1024)).toFixed(2) + " MB",
      "Material preference: " + material,
      "Quantity: " + quantity,
      "Notes: " + (notes || "No additional notes"),
      "",
      "I understand this is a quote request; manufacturability and price require review.",
      "The file is not uploaded by this website. I will attach it in WhatsApp manually.",
    ].join("\n");
    window.open("https://wa.me/" + catalog.pricing.whatsappNumber.replace(/\D/g, "") + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
  }
  return <main className="page-shell">
    <PageIntro eyebrow="Custom fabrication" title="Bring a model. Make it real." description="Request a quote for an STL, STEP, STP, OBJ or 3MF file. We review geometry, material and build constraints before confirming the price." />
    <div className="custom-layout"><div className="custom-story"><span className="eyebrow">From file to finished part</span><h2>Good parts start with a good brief.</h2><p>Share the model, describe what it needs to do, and we will review the dimensions, material and tolerances before confirming a quote.</p><div className="process-steps"><div><b>01</b><span><strong>Submit model</strong><small>STL, STEP, STP, OBJ or 3MF</small></span></div><div><b>02</b><span><strong>Engineering review</strong><small>Dimensions, strength and printability</small></span></div><div><b>03</b><span><strong>Approve quote</strong><small>Price and lead time confirmed before production</small></span></div></div></div>
      <form className="form-panel custom-form" onSubmit={openRequest}><span className="step-label">QUOTE REQUEST</span><h2>Project details</h2>
        <label className="file-drop"><input type="file" accept=".stl,.step,.stp,.obj,.3mf" onChange={(e) => acceptFile(e.target.files?.[0])} /><span className="file-icon">↥</span><strong>{fileName || "Choose your 3D model"}</strong><small>{fileName ? (fileSize / (1024 * 1024)).toFixed(2) + " MB selected" : "STL, STEP, STP, OBJ or 3MF · up to 150 MB"}</small></label>
        <div className="form-grid"><label>Material preference<select value={material} onChange={(e) => setMaterial(e.target.value)}>{["PLA Pro", "PETG", "ABS", "PETG-CF", "Not sure — advise me"].map((m) => <option key={m}>{m}</option>)}</select></label><label>Quantity<input type="number" min="1" max="999" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label><label className="span-two">What should we know?<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dimensions, intended use, strength, colour, tolerance…" /></label></div>
        <div className="notice notice-warning"><strong>File handling notice</strong><p>This recovered application has no configured private CAD storage. Your file is checked locally but is not uploaded or saved here. The request opens WhatsApp; attach the model file yourself in that chat.</p></div>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <button className="button-primary full" type="submit">Continue on WhatsApp ↗</button><p className="muted small">This is a quotation request, not an instant manufacturability guarantee or confirmed order.</p>
      </form>
    </div>
  </main>;
}

function PoliciesView() {
  return <main className="page-shell"><PageIntro eyebrow="Clear terms" title="Good work needs clear expectations." description="How payment, collection, shipping, cancellations and refund reviews work at LayerLabs." compact />
    <div className="policy-grid">
      <article className="policy-card"><span>01 / PAYMENTS</span><h2>Manual UPI verification</h2><p>Orders remain <strong>Payment Pending</strong> until a LayerLabs administrator verifies the transaction reference against bank records. A UTR or screenshot by itself does not establish receipt of payment.</p><p>Never provide your UPI PIN, banking OTP or card security code to LayerLabs.</p></article>
      <article className="policy-card"><span>02 / CANCELLATION</span><h2>Before production</h2><p>Orders that are still pending can be submitted for cancellation through Order Tracking. A matching order ID and checkout email are required. The cancellation is saved only when the shared order service confirms it.</p><p>Once payment is verified and fabrication has begun, a custom order may no longer be cancellable due to material and production costs.</p></article>
      <article className="policy-card"><span>03 / REFUNDS</span><h2>Reviewed, not automatic</h2><p>If payment was verified and production has not started, contact LayerLabs through Order Tracking to request a refund review. Refunds are individually reviewed and manually processed through the original payment route where possible.</p><p>A “requested” or “approved” status is not proof that money has been transferred.</p></article>
      <article className="policy-card"><span>04 / SHIPPING</span><h2>Collection & delivery</h2><p>The available delivery choices and charges are shown at checkout. Estimated dispatch dates depend on fabrication and review. Tracking details are added to the order when a shipment is booked.</p><p>Studio collection is available only where that option is explicitly shown.</p></article>
      <article className="policy-card"><span>05 / CUSTOM PRINTS</span><h2>Quote first, production second</h2><p>Custom models require review of units, dimensions, orientation, material and manufacturability. A browser preview alone cannot guarantee printability or the final material and machine time.</p><p>Production begins only after the quote and payment have been confirmed.</p></article>
      <article className="policy-card"><span>06 / DEFECTS</span><h2>Raise an issue promptly</h2><p>For a suspected manufacturing defect, contact LayerLabs with your order reference and clear photographs within 48 hours of delivery. We will review the issue and explain the available remedy.</p><p>Digital files and custom-made items may be subject to different remedies depending on the work completed.</p></article>
    </div>
    <div className="notice"><strong>Need help?</strong> Email <a href="mailto:layerlabs2021@gmail.com">layerlabs2021@gmail.com</a> and include your order reference where applicable.</div>
  </main>;
}

function AboutView({ catalog }: { catalog: StoreCatalog }) {
  return <main className="page-shell"><PageIntro eyebrow="The studio" title="Useful objects. Carefully engineered." description="LayerLabs brings mechanical thinking and digital fabrication together: from one-off prototypes to thoughtful desk models and custom parts." />
    <div className="about-grid"><div className="about-feature"><span className="eyebrow">01 / FABRICATION</span><h2>Make ideas physical.</h2><p>FDM 3D printing for prototypes, engineering demonstrators, fixtures and functional components. Quotes are reviewed against geometry and the intended use.</p></div><div className="about-feature"><span className="eyebrow">02 / DESIGN</span><h2>Design with intent.</h2><p>Mechanical CAD drafting and model preparation focused on fit, function, tolerances and practical manufacturing constraints.</p></div><div className="about-feature"><span className="eyebrow">03 / PRODUCTS</span><h2>Small runs, real detail.</h2><p>Engineering-inspired products for curious minds, workshop benches and the people who like to know how things work.</p></div></div>
    <div className="contact-band"><div><span className="eyebrow">Start a conversation</span><h2>Have a project in mind?</h2></div><div><p>Tell us what you want to make and what the part needs to do.</p><a className="button-primary" href={"https://wa.me/" + catalog.pricing.whatsappNumber.replace(/\D/g, "")} target="_blank" rel="noreferrer">Talk to the studio ↗</a></div></div>
  </main>;
}

function AdminView({ catalog, catalogIsLive, onCatalogUpdated }: {
  catalog: StoreCatalog; catalogIsLive: boolean; onCatalogUpdated: (next: StoreCatalog) => void;
}) {
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [tab, setTab] = useState<"orders" | "catalog">("orders");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [draftCatalog, setDraftCatalog] = useState<StoreCatalog>(catalog);

  useEffect(() => setDraftCatalog(catalog), [catalog]);

  const refreshOrders = useCallback(async () => {
    const current = getAdminSession();
    if (!current) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const rows = await supabaseRequest<StoreOrder[]>("/rest/v1/store_orders?select=*&order=created_at.desc&limit=250", { token: current.access_token });
      setOrders(rows || []);
      setNotice("Shared orders refreshed.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load orders."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { if (session) void refreshOrders(); }, [session, refreshOrders]);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await loginAdmin(email, password);
      setSession(result); setPassword(""); setNotice("Administrator session established.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }

  async function setOrderStatus(order: StoreOrder, status: string) {
    const current = getAdminSession();
    if (!current) { setError("Sign in again to update orders."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await supabaseRequest("/rest/v1/store_orders?order_number=eq." + encodeURIComponent(order.order_number), {
        method: "PATCH", token: current.access_token, prefer: "return=representation",
        body: { status, updated_at: new Date().toISOString() },
      });
      setNotice(order.order_number + " updated. Confirm the saved state by refreshing the list.");
      await refreshOrders();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The order update failed."); }
    finally { setBusy(false); }
  }

  async function saveTracking(order: StoreOrder, form: HTMLFormElement) {
    const current = getAdminSession();
    if (!current) return;
    const data = new FormData(form);
    const number = String(data.get("tracking_number") || "").trim();
    const courier = String(data.get("courier_name") || "").trim();
    const url = String(data.get("tracking_url") || "").trim();
    if (url && !safeExternal(url)) { setError("Tracking URL must be a valid http(s) address."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await supabaseRequest("/rest/v1/store_orders?order_number=eq." + encodeURIComponent(order.order_number), {
        method: "PATCH", token: current.access_token, prefer: "return=representation",
        body: { tracking_number: number || null, courier_name: courier || null, tracking_url: url || null, status: "SHIPPED", updated_at: new Date().toISOString() },
      });
      setNotice("Tracking details saved for " + order.order_number + ".");
      await refreshOrders();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save tracking details."); }
    finally { setBusy(false); }
  }

  async function saveCatalogue(event: FormEvent) {
    event.preventDefault();
    const current = getAdminSession();
    if (!current) { setError("Sign in again to edit the catalogue."); return; }
    if (!catalogIsLive) { setError("The shared catalogue is unavailable."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await supabaseRequest("/rest/v1/store_catalog?id=eq.1", {
        method: "PATCH", token: current.access_token, prefer: "return=representation",
        body: { catalog: draftCatalog },
      });
      onCatalogUpdated(draftCatalog);
      setNotice("Shared catalogue saved. The published products now use the updated values.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Catalogue save failed."); }
    finally { setBusy(false); }
  }

  if (!session) return <main className="page-shell admin-shell"><PageIntro eyebrow="Restricted workspace" title="Administrator sign-in." description="Use an allowlisted LayerLabs administrator account. Access is enforced by Supabase, not by a hidden page." compact />
    <form className="form-panel admin-login" onSubmit={signIn}><span className="step-label">AUTHENTICATED ACCESS</span><label>Email address<input required type="email" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} /></label><label>Password<input required type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} /></label>
      {!isSupabaseConfigured() && <div className="notice notice-warning">This deployment is missing its Supabase environment configuration.</div>}
      {error && <div role="alert" className="notice notice-error">{error}</div>}<button className="button-primary full" disabled={busy || !isSupabaseConfigured()}>{busy ? "Signing in…" : "Sign in securely ↗"}</button><p className="muted small">Only allowlisted accounts can manage orders and catalogue settings. Passwords are sent directly to Supabase Auth and are not stored in this app.</p>
    </form></main>;

  return <main className="page-shell admin-shell"><PageIntro eyebrow="Administrator workspace" title="Keep the work moving." description={"Signed in as " + (session.user.email || "LayerLabs administrator") + ". Verify payment, update fulfilment and edit the published catalogue."} compact />
    <div className="admin-toolbar"><div className="admin-tabs"><button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>Orders <span>{orders.length}</span></button><button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}>Catalogue</button></div><div className="inline-actions"><button className="button-secondary" onClick={() => void refreshOrders()} disabled={busy}>↻ Refresh</button><button className="text-link" onClick={async () => { await logoutAdmin(); setSession(null); setOrders([]); }}>Sign out</button></div></div>
    {error && <div role="alert" className="notice notice-error">{error}</div>}{notice && <div className="notice notice-success">{notice}</div>}
    {tab === "orders" ? <div className="admin-order-list">{orders.length === 0 ? <div className="empty-state"><h2>No orders to show.</h2><p>Refresh to check the shared order table.</p></div> : orders.map((order) => <article className="admin-order" key={order.order_number}>
      <div className="admin-order-head"><div><span className="eyebrow">{formatDate(order.created_at)}</span><h2>{order.order_number}</h2><p>{order.customer_name} · {order.customer_email} · {order.customer_phone || "No phone"}</p></div><div className="admin-order-status"><strong>{formatINR(order.total_amount)}</strong><OrderStatus status={order.status} /></div></div>
      <div className="admin-order-facts"><span>UTR <b>{order.upi_reference_number || "Not provided"}</b></span><span>Delivery <b>{order.delivery_option_name || "—"}</b></span><span>Refund <b>{order.refund_status || "NOT_REQUESTED"}</b></span></div>
      <div className="admin-order-items">{(order.items || []).map((line, index) => <div key={index}><strong>{line.product.name}</strong><small>Qty {line.quantity}{line.selectedColor ? " · " + line.selectedColor : ""}{line.selectedMaterial ? " · " + line.selectedMaterial : ""}</small></div>)}</div>
      <div className="admin-actions">
        {order.status === "PAYMENT_PENDING" && <><button className="button-primary small-button" disabled={busy} onClick={() => void setOrderStatus(order, "PAYMENT_VERIFIED")}>Verify payment</button><button className="button-secondary small-button" disabled={busy} onClick={() => void setOrderStatus(order, "REJECTED")}>Reject reference</button></>}
        {["PAYMENT_VERIFIED", "PROCESSING"].includes(order.status) && <><button className="button-secondary small-button" disabled={busy} onClick={() => void setOrderStatus(order, "PROCESSING")}>In production</button><button className="button-secondary small-button" disabled={busy} onClick={() => void setOrderStatus(order, "CANCELLED")}>Cancel order</button></>}
        {order.status === "SHIPPED" && <button className="button-secondary small-button" disabled={busy} onClick={() => void setOrderStatus(order, "DELIVERED")}>Mark delivered</button>}
        {order.status === "PAYMENT_VERIFIED" && <button className="button-secondary small-button" disabled={busy} onClick={() => void setOrderStatus(order, "CANCELLED")}>Cancel order</button>}
      </div>
      <form className="tracking-editor" onSubmit={(e) => { e.preventDefault(); void saveTracking(order, e.currentTarget); }}><label>Courier<input name="courier_name" defaultValue={order.courier_name || "India Post Speed Post"} /></label><label>Tracking number<input name="tracking_number" defaultValue={order.tracking_number || ""} /></label><label>Tracking URL<input name="tracking_url" type="url" defaultValue={order.tracking_url || ""} placeholder="https://…" /></label><button className="button-secondary small-button" disabled={busy} type="submit">Save & mark shipped</button></form>
    </article>)}</div> : <form className="catalog-editor" onSubmit={saveCatalogue}>
      <div className="editor-intro"><div><span className="eyebrow">PUBLISHED DATA</span><h2>Product catalogue</h2><p>Price, sale price, cover image and variants are saved to the shared database, not only this browser.</p></div><button className="button-primary" disabled={busy || !catalogIsLive}>{busy ? "Saving…" : "Publish catalogue ↗"}</button></div>
      {draftCatalog.products.map((product, index) => <div className="catalog-edit-row" key={product.id}><div className="catalog-edit-heading"><div><strong>{product.name}</strong><small>{product.id}</small></div><span>{product.stock ?? "—"} in stock</span></div><div className="form-grid">
        <label>Price (₹)<input type="number" min="0" step="1" value={product.price} onChange={(e) => setDraftCatalog((prev) => ({ ...prev, products: prev.products.map((p, i) => i === index ? { ...p, price: Number(e.target.value) } : p) }))} /></label>
        <label>Sale price (₹)<input type="number" min="0" step="1" value={product.salePrice ?? ""} onChange={(e) => setDraftCatalog((prev) => ({ ...prev, products: prev.products.map((p, i) => i === index ? { ...p, salePrice: e.target.value ? Number(e.target.value) : null } : p) }))} /></label>
        <label className="span-two">Cover image URL<input type="url" value={product.images?.[0] || product.imageUrl || ""} onChange={(e) => setDraftCatalog((prev) => ({ ...prev, products: prev.products.map((p, i) => i === index ? { ...p, images: [e.target.value, ...(p.images || []).slice(1)], imageUrl: e.target.value } : p) }))} /></label>
        <label>Colours (comma separated)<input value={(product.variants?.colors || []).join(", ")} onChange={(e) => setDraftCatalog((prev) => ({ ...prev, products: prev.products.map((p, i) => i === index ? { ...p, variants: { ...p.variants, colors: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } } : p) }))} /></label>
        <label>Materials (comma separated)<input value={(product.variants?.materials || []).join(", ")} onChange={(e) => setDraftCatalog((prev) => ({ ...prev, products: prev.products.map((p, i) => i === index ? { ...p, variants: { ...p.variants, materials: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } } : p) }))} /></label>
      </div></div>)}
      <div className="editor-intro"><div><span className="eyebrow">DELIVERY</span><h2>Delivery options</h2><p>Enable or disable the options customers can choose at checkout.</p></div></div>
      {draftCatalog.shippingSettings.options.map((option) => <label className="delivery-option" key={option.id}><input type="checkbox" checked={option.enabled} onChange={(e) => setDraftCatalog((prev) => ({ ...prev, shippingSettings: { ...prev.shippingSettings, options: prev.shippingSettings.options.map((o) => o.id === option.id ? { ...o, enabled: e.target.checked } : o) } }))} /><span className="delivery-option-copy"><strong>{option.name}</strong><small>{option.estimatedDelivery}</small></span><label className="inline-price">₹ <input aria-label={"Price for " + option.name} type="number" min="0" value={option.price} onChange={(e) => setDraftCatalog((prev) => ({ ...prev, shippingSettings: { ...prev.shippingSettings, options: prev.shippingSettings.options.map((o) => o.id === option.id ? { ...o, price: Number(e.target.value) } : o) } }))} /></label></label>)}
    </form>}
  </main>;
}

function HomeView({ products, onAdd }: { products: Product[]; onAdd: (p: Product, color?: string, material?: string) => void }) {
  return <main>
    <section className="hero-section"><div className="hero-copy"><span className="eyebrow"><i /> INDEPENDENT FABRICATION STUDIO · HYDERABAD, INDIA</span><h1>Make ideas<br /><em>tangible.</em></h1><p>Engineering-first 3D printing and mechanical CAD. Thoughtful products, functional prototypes and custom parts, made with purpose.</p><div className="hero-actions"><Link to="/products" className="button-primary">Explore the catalogue ↗</Link><Link to="/custom-print" className="button-secondary">Get a custom quote</Link></div><div className="hero-signals"><span><b>01</b> Functional FDM printing</span><span><b>02</b> Mechanical CAD design</span><span><b>03</b> Short-run production</span></div></div>
      <div className="hero-visual"><div className="hero-grid" /><img src="https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=90" alt="Engineering prototype and fabrication workbench" fetchPriority="high" /><div className="visual-overlay" /><div className="visual-label visual-label-top">FORM / FUNCTION / FIT</div><div className="visual-label visual-label-bottom"><span>LL–01</span><span>MADE FOR REAL-WORLD USE</span></div><div className="visual-stamp">DESIGNED<br />TO BE<br /><em>MADE.</em></div></div>
    </section>
    <section className="assurance-strip"><span>DESIGNED WITH INTENT</span><span>PRINTED WITH PRECISION</span><span>REVIEWED BY ENGINEERS</span><span>BUILT FOR REAL USE</span></section>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">01 / SELECTED WORK</span><h2>Small objects.<br /><em>Big curiosity.</em></h2></div><Link to="/products" className="text-link">View all products ↗</Link></div><div className="product-grid home-products">{products.filter((p) => p.featured !== false).slice(0, 3).map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} />)}</div></section>
    <section className="workband"><div className="workband-image"><img src="https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=1200&q=85" alt="Industrial prototyping and component assembly" loading="lazy" /></div><div className="workband-copy"><span className="eyebrow">02 / CUSTOM FABRICATION</span><h2>Have the idea.<br /><em>We'll help make it.</em></h2><p>Share a model or describe the problem. We review the part, production approach and tolerances before confirming a quotation.</p><Link to="/custom-print" className="button-secondary">Start a custom print ↗</Link></div></section>
    <section className="section-block capabilities-block"><div className="section-heading"><div><span className="eyebrow">03 / CAPABILITIES</span><h2>From screen<br />to <em>solid.</em></h2></div><p>One practical workflow for digital design, physical testing and repeatable making.</p></div><div className="capability-grid"><article><span>01</span><h3>FDM 3D printing</h3><p>Functional prototypes, useful desk objects and low-volume parts, produced to a clear brief.</p><Link to="/custom-print">Explore printing ↗</Link></article><article><span>02</span><h3>Mechanical CAD</h3><p>Design development, geometry cleanup and model preparation with fit and function in mind.</p><Link to="/about">Talk through a design ↗</Link></article><article><span>03</span><h3>Engineering products</h3><p>Compact demonstrators and mechanical models that invite a closer look at how things work.</p><Link to="/products">Browse products ↗</Link></article></div></section>
    <section className="closing-band"><span className="eyebrow">GOOD IDEAS DESERVE A REAL OBJECT.</span><h2>Let's make something<br /><em>worth keeping.</em></h2><Link to="/custom-print" className="button-primary">Start a project ↗</Link></section>
  </main>;
}

export default function App() {
  const [view, setView] = useState<View>(getRoute);
  const [catalog, setCatalog] = useState<StoreCatalog>(FALLBACK_CATALOG);
  const [catalogIsLive, setCatalogIsLive] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const saved = localStorage.getItem("layerlabs_cart_v2");
      return saved ? JSON.parse(saved) as CartLine[] : [];
    } catch { return []; }
  });
  const [lastOrder, setLastOrder] = useState<StoreOrder | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const handlePop = () => setView(getRoute());
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoadingCatalog(true);
    loadCatalog(controller.signal).then(({ catalog: next, isLive }) => {
      if (controller.signal.aborted) return;
      setCatalog(next); setCatalogIsLive(isLive);
    }).finally(() => { if (!controller.signal.aborted) setLoadingCatalog(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    try { localStorage.setItem("layerlabs_cart_v2", JSON.stringify(cart)); } catch {}
  }, [cart]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const products = useMemo(() => liveProducts(catalog), [catalog]);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartKey = (line: CartLine) => [line.product.id, line.selectedColor || "", line.selectedMaterial || ""].join("::");

  const addToCart = useCallback((product: Product, selectedColor?: string, selectedMaterial?: string) => {
    setCart((current) => {
      const found = current.find((line) => line.product.id === product.id && line.selectedColor === selectedColor && line.selectedMaterial === selectedMaterial);
      return found ? current.map((line) => line === found ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line) : [...current, { product, quantity: 1, selectedColor, selectedMaterial }];
    });
    setToast(product.name + " added to your bag.");
  }, []);

  const updateCartLine = useCallback((key: string, delta: number) => {
    setCart((current) => current.flatMap((line) => {
      if (cartKey(line) !== key) return [line];
      const quantity = Math.min(99, line.quantity + delta);
      return quantity <= 0 ? [] : [{ ...line, quantity }];
    }));
  }, []);

  const removeCartLine = (key: string) => setCart((current) => current.filter((line) => cartKey(line) !== key));
  const clearCart = () => setCart([]);

  let content: React.ReactNode;
  if (view === "home") content = <HomeView products={products} onAdd={addToCart} />;
  else if (view === "products") content = <main className="page-shell"><PageIntro eyebrow="The catalogue" title="Considered objects." description="Engineering-inspired models and practical printed parts. Choose from the published colour and material variants." compact />
    {!catalogIsLive && <div className="notice notice-warning">Showing a catalogue fallback because the shared service is not configured. Live checkout is disabled until the shared catalogue loads.</div>}
    <div className="catalog-tools"><span>{products.length} published objects</span><span>Prices in INR · Final totals validated at checkout</span></div><div className="product-grid">{products.map((p) => <ProductCard key={p.id} product={p} onAdd={addToCart} />)}</div></main>;
  else if (view === "product") {
    const slugOrId = decodeURIComponent(window.location.pathname.split("/").pop() || "");
    const product = products.find((p) => p.id === slugOrId || p.slug === slugOrId);
    content = product ? <main className="page-shell product-detail-shell"><div className="product-detail-grid"><div className="detail-image">{safeExternal(product.images?.[0] || product.imageUrl) && <img src={product.images?.[0] || product.imageUrl} alt={product.name} />}</div><div className="detail-copy"><span className="eyebrow">PRODUCT / {product.sku || product.id}</span><h1>{product.name}</h1><p>{product.longDescription || product.description || "A considered engineering object, printed and finished by LayerLabs."}</p><strong className="detail-price">{formatINR(Number(product.salePrice ?? product.price))}</strong>{product.variants?.colors?.length ? <label>Colour<select id="detail-color">{product.variants.colors.map((c) => <option key={c}>{c}</option>)}</select></label> : null}{product.variants?.materials?.length ? <label>Material<select id="detail-material">{product.variants.materials.map((m) => <option key={m}>{m}</option>)}</select></label> : null}<button className="button-primary full" onClick={() => addToCart(product, (document.getElementById("detail-color") as HTMLSelectElement | null)?.value, (document.getElementById("detail-material") as HTMLSelectElement | null)?.value)}>Add to bag ↗</button><p className="muted small">Production and delivery timings depend on availability and order review.</p><Link to="/policies" className="text-link">Read shipping & refund policies</Link></div></div></main> : <main className="page-shell"><PageIntro eyebrow="Catalogue" title="Product not found." description="This item may have changed or been unpublished." compact /><Link to="/products" className="button-primary">Return to catalogue</Link></main>;
  }
  else if (view === "cart") content = <CartView cart={cart} catalog={catalog} updateLine={updateCartLine} removeLine={removeCartLine} />;
  else if (view === "checkout") content = <CheckoutView cart={cart} catalog={catalog} catalogIsLive={catalogIsLive && isSupabaseConfigured()} clearCart={clearCart} onOrderCreated={(order) => { setLastOrder(order); setView("track"); goTo("/track-order"); setToast("Order saved as " + order.order_number + "."); }} />;
  else if (view === "track") content = <>{lastOrder && <main className="page-shell"><div className="notice notice-success">Your order was saved successfully. Keep this reference and use the same checkout email to track it.</div><OrderDetails order={lastOrder} /><button className="text-link" onClick={() => setLastOrder(null)}>Close confirmation</button></main>}<TrackView /></>;
  else if (view === "custom") content = <CustomPrintView catalog={catalog} />;
  else if (view === "policies") content = <PoliciesView />;
  else if (view === "about") content = <AboutView catalog={catalog} />;
  else content = <AdminView catalog={catalog} catalogIsLive={catalogIsLive} onCatalogUpdated={setCatalog} />;

  return <div className="app-root"><Header cartCount={cartCount} />{loadingCatalog && <div className="loadline" aria-label="Loading shared catalogue" />}{content}<Footer />
    {toast && <div role="status" className="toast-message">{toast}</div>}
    {!catalogIsLive && isSupabaseConfigured() && <div className="service-note">Catalogue connection issue · fallback values shown · checkout disabled</div>}
  </div>;
}
