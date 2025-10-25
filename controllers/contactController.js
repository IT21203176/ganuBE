const nodemailer = require("nodemailer");
const Contact = require("../models/Contact");

// Send contact message and save to database
exports.sendJoinMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) 
      return res.status(400).json({ message: "All fields required" });

    // Save contact message to database
    const contact = new Contact({
      name,
      email,
      message,
      read: false
    });
    await contact.save();

    // Send email notification
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
      subject: `New Contact Form Submission from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n\n---\nThis message was submitted via your website contact form.`
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Message sent successfully" });

  } catch (err) {
    console.error("sendJoinMessage error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
};

// Get all contacts (admin only)
exports.getContacts = async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json(contacts);
  } catch (err) {
    console.error("getContacts error:", err);
    res.status(500).json({ message: "Failed to fetch contacts" });
  }
};

// Mark contact as read
exports.markAsRead = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.json(contact);
  } catch (err) {
    console.error("markAsRead error:", err);
    res.status(500).json({ message: "Failed to update contact" });
  }
};

// Delete contact
exports.deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.json({ message: "Contact deleted successfully" });
  } catch (err) {
    console.error("deleteContact error:", err);
    res.status(500).json({ message: "Failed to delete contact" });
  }
};