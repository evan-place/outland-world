import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const TO = "team@enteroutland.com";
const FROM = process.env.RESEND_FROM || "Outland <onboarding@resend.dev>";

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email, message } = req.body ?? {};

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: "All fields are required." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: email.trim(),
      subject: `New inquiry from ${name.trim()}`,
      html: [
        `<p><strong>Name:</strong> ${escapeHtml(name.trim())}</p>`,
        `<p><strong>Email:</strong> ${escapeHtml(email.trim())}</p>`,
        `<p><strong>Message:</strong></p>`,
        `<p>${escapeHtml(message.trim()).replace(/\n/g, "<br>")}</p>`,
      ].join("\n"),
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(502).json({ error: "Failed to send. Please try again." });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Contact send error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
