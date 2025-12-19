import coupon from "../../model/couponSchema.js";

const getAvailableCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please login to view coupons"
      });
    }
    
    const coupons = await coupon
      .find({
        status: true,
        expireAt: { $gte: new Date() },
      })
      .select("code discountValue minCartValue expireAt description")

    res.status(200).json({
      success: true,
      coupons: coupons
    });
    
  } catch (error) {
    console.log("Error fetching coupons:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while loading coupons"
    });
  }
};



export default { getAvailableCoupon};