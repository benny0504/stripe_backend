const express = require("express");
const app = express();
const { resolve } = require("path");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(express.static("public")); // Optional, for future static files
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connection token endpoint (for your terminal.html)
app.post("/connection_token", async (req, res) => {
  try {
    const token = await stripe.terminal.connectionTokens.create();
    res.json({ secret: token.secret });
  } catch (error) {
    console.log("Error in /connection_token:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create payment intent endpoint
app.post("/create_payment_intent", async (req, res) => {
  try {
    const { amount } = req.body;
    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card_present"],
      capture_method: "automatic", // Matches your original setup
    });
    res.json({ clientSecret: intent.client_secret });
  } catch (error) {
    console.log("Error in /create_payment_intent:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Process payment endpoint (uses your registered reader)
app.post("/process_payment", async (req, res) => {
  var attempt = 0;
  const tries = 3;
  while (true) {
    attempt++;
    try {
      const reader = await stripe.terminal.readers.processPaymentIntent(
        "WSC513208022998", // Your registered WisePOS E serial number
        { payment_intent: req.body.payment_intent_id }
      );
      return res.send(reader);
    } catch (error) {
      console.log("Error in /process_payment:", error.message);
      switch (error.code) {
        case "terminal_reader_timeout":
          if (attempt === tries) return res.send(error);
          break;
        case "terminal_reader_offline":
        case "terminal_reader_busy":
        case "intent_invalid_state":
          const paymentIntent = await stripe.paymentIntents.retrieve(
            req.body.payment_intent_id
          );
          console.log("PaymentIntent state:", paymentIntent.status);
          return res.send(error);
        default:
          return res.send(error);
      }
    }
  }
});

// Simulate payment endpoint (for testing)
app.post("/simulate_payment", async (req, res) => {
  try {
    const reader = await stripe.testHelpers.terminal.readers.presentPaymentMethod(
      "WSC513208022998" // Your WisePOS E serial
    );
    res.send(reader);
  } catch (error) {
    console.log("Error in /simulate_payment:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Capture payment intent endpoint (optional, since you use automatic capture)
app.post("/capture_payment_intent", async (req, res) => {
  try {
    const intent = await stripe.paymentIntents.capture(req.body.payment_intent_id);
    res.send(intent);
  } catch (error) {
    console.log("Error in /capture_payment_intent:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Render-compatible port
app.listen(process.env.PORT || 3000, () => console.log("Server running"));
