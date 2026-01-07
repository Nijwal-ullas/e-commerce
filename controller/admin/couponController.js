import Coupons from "../../model/couponSchema.js";
import statusCode from "../../utilities/statusCodes.js";
import errorMessage from "../../utilities/errorMessages.js";

const couponRegex = /^[A-Z0-9-]{5,20}$/;

const getCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const totalCoupons = await Coupons.countDocuments();

    const couponsList = await Coupons.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalCoupons / limit);

    res.render("admin/coupon", {
      coupons: couponsList,
      totalPages,
      currentPage: page,
      limit,
      totalCoupons,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const addCoupon = async (req, res) => {
  try {
    const { couponCode, description, minCartValue, discountValue, expireAt } =
      req.body;

    if (
      !couponCode ||
      minCartValue == null ||
      discountValue == null ||
      !expireAt
    ) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "fill the required field....",
      });
    }

    if (!couponRegex.test(couponCode.trim())) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "plz enter a valid couponCode",
      });
    }

    const code = couponCode.trim().toUpperCase();
    const existing = await Coupons.findOne({ code });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "coupon is already exist",
      });
    }

    if (minCartValue < 0) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "minCartValue cant be negative",
      });
    }

    if (discountValue < 0) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "discount value cannot be negative",
      });
    }

    if (discountValue > minCartValue) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "discountvalue cannot be greater than cartvalue",
      });
    }

    const expiry = new Date(expireAt);
    if (isNaN(expiry.getTime()) || expiry <= new Date()) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Expiry date must be a future date",
      });
    }

    const newCoupon = new Coupons({
      code,
      description,
      expireAt: expiry,
      minCartValue,
      discountValue,
    });

    await newCoupon.save();

    res.status(statusCode.OK).json({
      success: true,
      message: "coupon added successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const editCoupon = async (req, res) => {
  try {
    const id = req.params.id;
    const { couponCode, description, minCartValue, discountValue, expireAt } =
      req.body;

    if (
      !couponCode ||
      minCartValue == null ||
      discountValue == null ||
      !expireAt
    ) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "fill the required field....",
      });
    }

    if (!couponRegex.test(couponCode.trim())) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "plz enter a valid couponCode",
      });
    }

    const code = couponCode.trim().toUpperCase();
    const existing = await Coupons.findOne({ code, _id: { $ne: id } });

    if (existing) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "coupon is already exist",
      });
    }

    if (minCartValue < 0) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "minCartValue cant be negative",
      });
    }

    if (discountValue < 0) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "discount value cannot be negative",
      });
    }

    if (discountValue > minCartValue) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "discountvalue cannot be greater than cartvalue",
      });
    }

    const expiry = new Date(expireAt);
    if (isNaN(expiry.getTime()) || expiry <= new Date()) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Expiry date must be a future date",
      });
    }

    const updated = await Coupons.findByIdAndUpdate(
      id,
      {
        code,
        description,
        expireAt: expiry,
        minCartValue,
        discountValue,
      },
      { new: true }
    );

    if (!updated) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "coupon not found",
      });
    }

    res.status(statusCode.OK).json({
      success: true,
      message: "updated successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const id = req.params.id;

    const deleted = await Coupons.findByIdAndDelete(id);

    if (!deleted) {
      res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "coupon not found",
      });
    }

    res.status(statusCode.OK).json({
      success: true,
      message: "coupon deleted successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const statusUpdate = async (req, res) => {
  try {
    const id = req.params.id;

    const coupon = await Coupons.findById(id);

    if (!coupon) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Coupon not found",
      });
    }

    coupon.status = !coupon.status;
    await coupon.save();

    res.status(statusCode.OK).json({
      success: true,
      message: `Coupon ${
        coupon.status ? "activated" : "deactivated"
      } successfully`,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

export default {
  getCoupons,
  addCoupon,
  editCoupon,
  deleteCoupon,
  statusUpdate,
};
