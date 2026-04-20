// Sprint 0.2: User routes with auth and role protection
const express = require("express");
const userController = require("../controllers/userController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();

// All user routes require authentication
// GET / and DELETE require admin role
// GET /:id and PUT /:id can be self-service or admin

router.get("/", 
  authMiddleware, 
  roleMiddleware(['admin']), 
  userController.getAllUsers
);

router.get("/:id", 
  authMiddleware, 
  userController.getUserById
);

router.put("/:id", 
  authMiddleware, 
  userController.updateUser
);

router.delete("/:id", 
  authMiddleware, 
  roleMiddleware(['admin']), 
  userController.deleteUser
);

module.exports = router;