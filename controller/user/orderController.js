import User from "../../model/userSchema.js";
import Order from "../../model/orderSchema.js"


const getOrder = async (req,res)=>{
    try {
       const userId = req.session.user;
     if(!userId) return res.redirect("/login")

        const userData = await User.findById(userId);
        const orderData = await Order.find({userId})

        return res.render("user/orderPage",{
            user : userData,
            order : orderData
        })
 
    } catch (error) {
        console.log(error);
    return res.status(500).send("Server Error");
    }
}


export default {getOrder}