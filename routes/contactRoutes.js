const express = require("express");
const { sendJoinMessage } = require("../controllers/contactController");
const router = express.Router();

router.post("/", sendJoinMessage);

module.exports = router;