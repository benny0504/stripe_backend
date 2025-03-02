require('dotenv').config();
const express = require("express");
const app = express();
const { resolve } = require("path");
const stripe = require("stripe")("(process.env.STRIPE_SECRET_KEY)"); // Use live secret key in Render environment
const cors = require("cors");

// Middleware setup
app.use(express.static("public")); // Serve static files (e.g., terminal.html)
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(cors({
  origin: ["https://stripe-backend-iu4y.onrender.com", "http://localhost:8080"] // Allow Render HTTPS and local dev
}));

// Check if STRIPE_SECRET_KEY is set
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Error: STRIPE_SECRET_KEY environment variable is not set");
  process.exit(1);
}

// Endpoint to create a connection token for the Stripe Terminal
app.post("/connection_token", async (req, res) => {
  try {
    const token = await stripe.terminal.connectionTokens.create();
    res.json({ secret: token.secret, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Error in /connection_token:", error.message, { stack: error.stack });
    res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
  }
});

// Endpoint to create a payment intent
app.post("/create_payment_intent", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ error: "Invalid or missing amount", timestamp: new Date().toISOString() });
    }
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: "automatic",
    });
    res.json({ clientSecret: intent.client_secret, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Error in /create_payment_intent:", error.message, { stack: error.stack });
    res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
  }
});

// Corrected /process_payment endpoint
app.post("/process_payment", async (req, res) => {
  const { payment_intent_id, reader_id } = req.body;

  // Validate inputs
  if (!payment_intent_id || !reader_id) {
    return res.status(400).json({ error: "Missing payment_intent_id or reader_id", timestamp: new Date().toISOString() });
  }

  // Basic validation for reader_id format (starts with "tmr_")
  if (!reader_id.startsWith("tmr_")) {
    return res.status(400).json({ error: "Invalid reader_id format", timestamp: new Date().toISOString() });
  }

  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      // Process the payment intent with the reader
      const reader = await stripe.terminal.readers.processPaymentIntent(
        reader_id,
        { payment_intent: payment_intent_id }
      );

      // Retrieve the payment intent to confirm its status
      const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
      return res.json({
        status: paymentIntent.status,
        reader: reader,
        paymentIntent: paymentIntent, // Include full payment intent for client
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error in /process_payment:", error.message, { stack: error.stack });
      switch (error.code) {
        case "terminal_reader_timeout":
          if (attempt === maxAttempts) {
            return res.status(500).json({ error: "Reader timeout after multiple attempts", timestamp: new Date().toISOString() });
          }
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
          break;
        case "terminal_reader_offline":
        case "terminal_reader_busy":
        case "intent_invalid_state":
          return res.status(400).json({ error: error.message, timestamp: new Date().toISOString() });
        default:
          return res.status(500).json({ error: error.message, timestamp: new Date().toISOString() });
      }
    }
  }
  return res.status(500).json({ error: "Max retry attempts reached", timestamp: new Date().toISOString() });
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port", process.env.PORT || 3000);
});
