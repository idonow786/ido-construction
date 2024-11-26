const express = require('express');
const router = express.Router();
const {signin} = require('../Controller/Admin/Registration');

const {updateAdminProfile} = require('../Controller/Admin/updateProfile');
const {verifyToken} = require('../Middleware/jwt');
const multer = require('multer');




const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 20 * 1024 * 1024, 
    },
  });
  



router.post('/signin', signin);                                                                                   //working
router.put('/profile/update', verifyToken, upload.single('profilePic'), updateAdminProfile);                      //working


                                                                       //working


module.exports = router;
