/*const nodemailer = require("nodemailer");

const getTransporter = (provider) => {
  switch (provider.toLowerCase()) {
    case "gmail":
      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL,
          pass: process.env.EMAIL_PASS, // Gmail App Password
        },
      });
    case "outlook":
      return nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.OUTLOOK_EMAIL,
          pass: process.env.OUTLOOK_PASS,
        },
      });
    case "zoho":
      return nodemailer.createTransport({
        host: "smtp.zoho.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.ZOHO_EMAIL,
          pass: process.env.ZOHO_PASS,
        },
      });
    default:
      throw new Error("Unsupported email provider");
  }
};

exports.sendJoinMessage = async (req, res) => {
  try {
    const { name, email, message, provider } = req.body;
    if (!name || !email || !message)
      return res.status(400).json({ message: "All fields required" });

    // Create transporter for the selected provider (default Gmail)
    const transporter = getTransporter(provider || "gmail");

    const mailOptions = {
      from: email,
      to: "ahjssdias@gmail.com", // for testing
      subject: `Join Us form from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Message sent successfully" });
  } catch (err) {
    console.error("sendJoinMessage error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
};*/

const nodemailer = require("nodemailer");

exports.sendJoinMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) 
      return res.status(400).json({ message: "All fields required" });

    // Create transporter for custom domain SMTP
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,      
      port: parseInt(process.env.SMTP_PORT),      
      secure: process.env.SMTP_SECURE === "true", 
      auth: {
        user: process.env.EMAIL,        
        pass: process.env.EMAIL_PASS    
      }
    });

    const mailOptions = {
      from: email,
      to: "ahjssdias@gmail.com", 
      subject: `Join Us form from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Message sent successfully" });

  } catch (err) {
    console.error("sendJoinMessage error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
};
