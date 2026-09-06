export interface Product {
  product_id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
}

export interface Order {
  order_id: string;
  product_id: string;
  quantity: number;
  customer: string;
}

export const PRODUCTS: Record<string, Product> = {
  "P001": {
    product_id: "P001",
    name: "Mechanical Keyboard Pro",
    category: "Electronics",
    price: 149.99,
    stock: 42,
    description: "Tactile 87-key mechanical keyboard with RGB backlight and Cherry MX switches.",
  },
  "P002": {
    product_id: "P002",
    name: "Ergonomic Mouse",
    category: "Electronics",
    price: 79.99,
    stock: 85,
    description: "Vertical ergonomic mouse with 6 programmable buttons and silent click.",
  },
  "P003": {
    product_id: "P003",
    name: "4K Monitor 27\"",
    category: "Electronics",
    price: 499.00,
    stock: 18,
    description: "IPS panel with 144Hz refresh rate, HDR400, and USB-C power delivery.",
  },
  "P004": {
    product_id: "P004",
    name: "Laptop Stand",
    category: "Accessories",
    price: 39.99,
    stock: 200,
    description: "Aluminium adjustable laptop stand, fits 11–17 inch laptops.",
  },
  "P005": {
    product_id: "P005",
    name: "Noise Cancelling Headphones",
    category: "Audio",
    price: 299.00,
    stock: 33,
    description: "Over-ear ANC headphones with 30hr battery and Hi-Res Audio support.",
  },
};

export const ORDERS: Record<string, Order> = {
  "ORD-001": { order_id: "ORD-001", product_id: "P001", quantity: 2, customer: "Alice" },
  "ORD-002": { order_id: "ORD-002", product_id: "P003", quantity: 1, customer: "Bob" },
  "ORD-003": { order_id: "ORD-003", product_id: "P005", quantity: 3, customer: "Carol" },
};

export const ORDER_STAGES = [
  { status: 1, label: "RECEIVED",         message: "Your order has been received and confirmed.",        progressPct: 10, delayMs: 500  },
  { status: 2, label: "PROCESSING",       message: "Payment verified. Picking items from warehouse.",    progressPct: 30, delayMs: 1000 },
  { status: 3, label: "PACKED",           message: "Items packed and ready for dispatch.",               progressPct: 50, delayMs: 1000 },
  { status: 4, label: "SHIPPED",          message: "Package handed over to courier partner.",            progressPct: 70, delayMs: 1500 },
  { status: 5, label: "OUT_FOR_DELIVERY", message: "Your package is out for delivery nearby you.",      progressPct: 90, delayMs: 1000 },
  { status: 6, label: "DELIVERED",        message: "Package delivered successfully.",                    progressPct: 100, delayMs: 500 },
];

export const BOT_REPLIES: Record<string, string> = {
  hello:      "Hello. How can I help you today?",
  hi:         "Hello. Welcome to support. What do you need help with?",
  order:      "To track your order, please share your order ID (e.g. ORD-001).",
  "ORD-001":  "Order ORD-001: Currently shipped, expected delivery tomorrow by 6 PM.",
  "ORD-002":  "Order ORD-002: Delivered on time to Bob. Let us know if you need a return.",
  "ORD-003":  "Order ORD-003: Still processing. 3 units of Headphones are being packed.",
  refund:     "For refunds, please allow 3-5 business days once initiated. Shall I process it?",
  yes:        "Confirmed. Initiating your refund now. You will receive a confirmation shortly.",
  no:         "Understood. No action taken. Is there anything else I can help you with?",
  thanks:     "You are welcome. Have a great day.",
  bye:        "Goodbye. Feel free to contact support anytime.",
};

export function getBotReply(userText: string): string {
  const lower = userText.toLowerCase().trim();
  for (const [key, reply] of Object.entries(BOT_REPLIES)) {
    if (lower.includes(key.toLowerCase())) return reply;
  }
  return `I understand you said: "${userText}". Let me connect you to a human agent for better assistance.`;
}

export function findProduct(id: string): Product | undefined {
  return PRODUCTS[id];
}

export function findOrder(id: string): Order | undefined {
  return ORDERS[id];
}

export function now(): string {
  return new Date().toISOString();
}
