const cheakoutRequest = require('../controllers/api/v1/StudentController') ;
const cheakoutRequest2 = require('../controllers/api/v1/OrganiserCOntroller') ;
const auth = require("../middleware/auth");
const express = require('express') ;

const Router = express.Router() ;

const passport = require('../config/passport') ;


Router.post('/cheakout-request' , passport.authenticate('jwt' , { session : false }) , cheakoutRequest.checkOutRequestController) ;
// Cancel your own pending checkout request — only within 1 hour of submitting it.
Router.delete('/cheakout-request/:id' , passport.authenticate('jwt' , { session : false }) , cheakoutRequest.cancelMyCheckoutRequest) ;
Router.get('/get-cheakout-request' , auth , cheakoutRequest2.getcheakOutrequest)
Router.put(
  "/update-cheakout-request-status/:id",
  auth,
  cheakoutRequest2.updateCheakoutRequestStatusController
);

module.exports = Router;