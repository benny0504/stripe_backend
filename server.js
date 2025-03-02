require('dotenv').config(); 
const express = require("express");
const app = express();
const { resolve } = require("path");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors"); // Add CORS

// Middleware setup
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(cors({ origin: "https://your-frontend.com" })); // Allow your frontend domain
app.use(cors({ origin: "http://localhost:8080" })); // Allow localhost (for development)

app.post("/connection_token", async (req, res) => {
  try {
    const token = await stripe.terminal.connectionTokens.create();
    res.json({ secret: token.secret });
  } catch (error) {
    console.log("Error in /connection_token:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/create_payment_intent", async (req, res) => {
  try {
    const { amount } = req.body;
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: "automatic",
    });
    res.json({ clientSecret: intent.client_secret });
  } catch (error) {
    console.log("Error in /create_payment_intent:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/process_payment", async (req, res) => {
  const { payment_intent_id, reader_id } = req.body; // Use reader_id from request
  let attempt = 0;
  const tries = 3;

  while (true) {
    attempt++;
    try {
      const reader = await stripe.terminal.readers.processPaymentIntent(
        reader_id, // Use reader_id from request
        { payment_intent: payment_intent_id }
      );
      return res.json(reader);
    } catch (error) {
      console.error("Error in /process_payment:", error.message);

      switch (error.code) {
        case "terminal_reader_timeout":
          if (attempt === tries) {
            return res.status(500).json({ error: "Reader timeout after retries" });
          }
          break;

        case "terminal_reader_offline":
          return res.status(500).json({ error: "Reader is offline" });

        case "terminal_reader_busy":
          return res.status(500).json({ error: "Reader is busy" });

        case "intent_invalid_state":
          const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
          console.log("PaymentIntent state:", paymentIntent.status);
          return res.status(500).json({ error: `PaymentIntent is in invalid state: ${paymentIntent.status}` });

        default:
          return res.status(500).json({ error: error.message });
      }
    }
  }
});

app.post("/simulate_payment", async (req, res) => {
  const { reader_id } = req.body; // Use reader_id from request

  try {
    const reader = await stripe.testHelpers.terminal.readers.presentPaymentMethod(reader_id);
    res.json(reader);
  } catch (error) {
    console.error("Error in /simulate_payment:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/capture_payment_intent", async (req, res) => {
  const { payment_intent_id } = req.body;

  try {
    const intent = await stripe.paymentIntents.capture(payment_intent_id);
    res.json(intent);
  } catch (error) {
    console.error("Error in /capture_payment_intent:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Server running"));
