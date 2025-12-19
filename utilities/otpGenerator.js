import nodemailer from "nodemailer"


export const otp=()=>{
    const generatedOtp = Math.floor(100000 + Math.random() * 900000);
    return generatedOtp.toString();
}


export const emailer = async function sendOtpEmail(email, otp) {
  if (!email) {
    console.error("Error: No email provided.");
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Your OTP Code",
      html: `<p>Your OTP code is <b>${otp}</b>. It is valid for 1 minute.</p>`,
    });

    return true;
  } catch (error) {
    console.log("Error sending OTP email:", error);
    return false;
  }
}