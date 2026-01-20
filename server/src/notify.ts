import nodemailer from "nodemailer";
import twilio from "twilio";

type Channel = "email" | "sms";

const hasEmailConfig =
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.SMTP_FROM;

const hasSmsConfig =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_FROM_NUMBER;

export const sendVerification = async (
  channel: Channel,
  target: string,
  code: string
) => {
  if (channel === "email") {
    if (!hasEmailConfig) {
      console.log(`[dev] Verification code for ${target}: ${code}`);
      return;
    }
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: target,
      subject: "Votre code de verification",
      text: `Votre code de verification est: ${code}`,
      html: `<p>Votre code de verification est: <strong>${code}</strong></p>`
    });
    return;
  }

  if (!hasSmsConfig) {
    console.log(`[dev] Verification code for ${target}: ${code}`);
    return;
  }

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  await client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to: target,
    body: `Votre code de verification est: ${code}`
  });
};
