# LayerLabs — High-Precision 3D Printing, CAD Design & IoT Hardware

> Production-grade, engineering-focused web application for **LayerLabs** — an additive fabrication bench, mechanical CAD drafting studio, and open embedded electronics store.

---

## ⚡ Live Development Server
- **Local URL:** [http://localhost:5173/](http://localhost:5173/)
- **Network URL:** Accessible on local LAN across devices/tablets

---

## 🛠️ Architecture & Technology Stack
- **Frontend Framework:** React 18 + TypeScript + Vite 6
- **Styling & Design System:** Tailwind CSS with custom engineering palette (`slate-950` deep surfaces, `sky-500` accents, `JetBrains Mono` and `Inter` typography)
- **Icons:** Lucide React engineering iconography
- **State Engine:** Persistent Typed React Context Store with dual-tier state (Cart, Wishlist, Custom Print Requests, CAD Projects, Orders, Live Pricing, Website Copy, and Administrative Audit Logs)
- **Build Quality:** TypeScript strict mode verified; production bundle transforms 1615 modules with zero errors.

---

## 💳 Strict Manual UPI Payment Implementation (V1)
Adheres strictly to Indian NPCI standards with zero third-party platform gateway surcharges:
- **Configured UPI ID:** `bsatwik@sbi`
- **Dynamic URI Generator:** Standard `upi://pay?pa=bsatwik@sbi&pn=LayerLabs&am={amount}&cu=INR&tn=Order_{orderId}`
- **Dynamic QR Code:** Auto-generated high-resolution QR containing exact amount and payee
- **One-Click Copy:** Seamless clipboard copy with feedback
- **UTR Submission:** 12-digit Unique Transaction Reference recorded upon checkout
- **Status Lifecycle:**
  1. `PAYMENT_PENDING` — Initial state on submission.
  2. `PAYMENT_VERIFIED` — Transitioned only when an authorized administrator manually verifies the UTR against bank records.
  3. `PRINTING` → `QUALITY_CHECK` → `PACKED` → `SHIPPED` → `DELIVERED`
- **Security Invariant:** Never asks for or stores UPI PIN, card CVV, or banking OTPs.

---

## ⚙️ Initial Configured Pricing & Rates (Admin Editable)
| Parameter | Default Value | Notes |
| :--- | :--- | :--- |
| **PLA Material Reference** | ₹1.00 / gram | Standard FDM rigid prototype reference rate |
| **Machine Time Rate** | ₹50.00 / hour | Volumetric CoreXY machine time rate |
| **Packaging Reference** | ₹30.00 | Shock-absorbent multi-layer box & bubble mailer |
| **Minimum Custom Order** | ₹500.00 | Threshold for promotional coupon eligibility |
| **Speed Post Shipping** | ₹49.00 | India Post Speed Post nationwide flat delivery |
| **First-Order Discount** | ₹10.00 | Promo code `FIRST10` |
| **Referral Discount** | ₹25.00 | Promo code `REF25` |

---

## 🚚 Shipping & Logistics Workflow
- **Carrier:** India Post Speed Post
- **Tracking Link Format:** `https://www.indiapost.gov.in/_layouts/15/dpt.ptc.tracktrace/tracktraces.aspx?trackingid={trackingNum}`
- **Packaging:** Multi-layer bubblewrap, ESD bags for IoT electronics, rigid corrugated cartons.

---

## 🔐 Administrative Operations Portal
- **Capabilities:**
  1. **Verify UPI Payments:** Review UTR, amount, customer contact, and click *Verify* or *Reject* (with reason).
  2. **Quotation Delivery:** Review customer 3D models (STL, STEP, 3MF), enter quoted amount in INR, material grams, and machine hours.
  3. **Order Status Updates:** Mark orders in print, caliper QC passed, packed, and dispatch with Speed Post consignment number.
  4. **Live Pricing Engine:** Edit material rates, machine rates, packaging cost, and shipping charges live without code redeployment.
  5. **No-Code Website Editor:** Edit announcement banner, hero headlines, and store badges.
  6. **Security Audit Log:** Real-time log of every administrative action with timestamp.

---

## 🤖 Rule-Based Support Chatbot
- Zero external paid AI API costs.
- Instant actions: Track Order, 3D Print Quote Guide, UPI Payment Procedure, Speed Post Shipping, Digital Licensing.
- Authenticated order lookup: Retrieves real order status only when an exact matching order ID (e.g. `ORD-XXXXXX`) or registered phone is supplied.
- Direct escalation to WhatsApp (`+917989064266`).

---

## 🧪 Automated Test Suite
Run the test suite:
```powershell
node test_layerlabs.cjs
```
All 12 automated unit tests cover:
- Dynamic UPI URI and payee formatting
- Bank UTR alphanumeric validation
- Pricing thresholds and coupon non-stacking logic
- Digital goods zero-shipping exclusion
- 3D file format extension and size validation
- Order status state transitions with administrative audit stamps.
