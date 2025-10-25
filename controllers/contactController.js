const nodemailer = require("nodemailer");
const Contact = require("../models/Contact");

// Send contact message and save to database
exports.sendJoinMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    console.log('Received contact form data:', { name, email, message });
    
    if (!name || !email || !message) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    // Save contact message to database
    const contact = new Contact({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
      read: false
    });
    
    await contact.save();
    console.log('Contact saved to database:', contact._id);

    // Send email notification (optional - only if email credentials are configured)
    if (process.env.EMAIL && process.env.EMAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp.gmail.com",      
          port: parseInt(process.env.SMTP_PORT) || 587,      
          secure: process.env.SMTP_SECURE === "true", 
          auth: {
            user: process.env.EMAIL,        
            pass: process.env.EMAIL_PASS    
          }
        });

        const mailOptions = {
          from: process.env.EMAIL,
          to: process.env.ADMIN_EMAIL || "ahjssdias@gmail.com", 
          subject: `New Contact Form Submission from ${name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">New Contact Form Submission</h2>
              <div style="background: #f5f5f5; padding: 20px; border-radius: 5px;">
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Message:</strong></p>
                <p style="background: white; padding: 15px; border-left: 4px solid #007bff; margin: 10px 0;">
                  ${message.replace(/\n/g, '<br>')}
                </p>
              </div>
              <p style="color: #666; font-size: 12px; margin-top: 20px;">
                This message was submitted via your website contact form.
              </p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log('Notification email sent successfully');
      } catch (emailError) {
        console.error('Failed to send notification email:', emailError);
        // Don't fail the entire request if email fails
      }
    }

    res.status(201).json({ 
      message: "Message sent successfully",
      contactId: contact._id 
    });

  } catch (err) {
    console.error("sendJoinMessage error:", err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: "Invalid contact data" });
    }
    
    res.status(500).json({ message: "Failed to send message. Please try again later." });
  }
};

// Get all contacts (admin only)
exports.getContacts = async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    console.log(`Fetched ${contacts.length} contacts`);
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
      { read: true, updatedAt: new Date() },
      { new: true }
    );
    
    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }
    
    console.log('Contact marked as read:', contact._id);
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
    
    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }
    
    console.log('Contact deleted:', contact._id);
    res.json({ message: "Contact deleted successfully" });
  } catch (err) {
    console.error("deleteContact error:", err);
    res.status(500).json({ message: "Failed to delete contact" });
  }
};