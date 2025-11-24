import Address from "../../model/addressSchema.js";
import User from "../../model/userSchema.js";

const pincodeRegex = /^\d{6}$/;
const phoneRegex = /^[6-9]\d{9}$/;

const loadAddressPage = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const userData = await User.findById(userId);
    const addresses = await Address.find({ userId });

    return res.render("user/addressPage", {
      user: userData,
      addresses: addresses,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send("Server Error");
  }
};

const loadAddAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const userData = await User.findById(userId);

    const addressId = req.params.id;
    let addressData = null;
    let isEdit = false;

    if (addressId) {
      addressData = await Address.findOne({ _id: addressId, userId });
      isEdit = true;

      if (!addressData) {
        return res.redirect("/address");
      }
    }

    return res.render("user/addAddressPage", {
      user: userData,
      address: addressData,
      isEdit: isEdit,
      addressId: addressId,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send("Server Error");
  }
};


const registerAddress = async (req, res) => {
  try {

    console.log("its here")
    const {
      
      addressLine1,
      addressLine2,
      landmark,
      pincode,
      city,
      state,
      country,
      userName,
      phone,
      alternatePhone,
      isDefault,
      type,
      addressId, 
    } = req.body;

  
    const finalAddressId = addressId || req.params.id;

    if (
      !addressLine1 ||
      !pincode ||
      !city ||
      !state ||
      !country ||
      !userName ||
      !phone
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields",
      });
    }

    if (!pincodeRegex.test(pincode.trim())) {
      return res.status(400).json({
        success: false,
        message: "Pincode must be six digits",
      });
    }

    if (!phoneRegex.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be ten digits",
      });
    }

    if (alternatePhone && !phoneRegex.test(alternatePhone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Alternative phone number must be ten digits",
      });
    }

    if (alternatePhone && phone === alternatePhone) {
      return res.status(400).json({
        success: false,
        message: "Phone numbers must be different",
      });
    }

    const userId = req.session.user;
    const userData = await User.findById(userId);

    if (!userData) {
      return res.status(400).json({
        success: false,
        message: "User does not exist",
      });
    }

    if (isDefault) {
      await Address.updateMany({ userId }, { $set: { isDefault: false } });
    }

        let result;

    if (finalAddressId) {
      result = await Address.findOneAndUpdate(
        { _id: finalAddressId, userId }, 
        {
          name: userName,
          addressType: type ? type.toLowerCase() : "home",
          flatNumber: addressLine1,
          streetName: addressLine2 || "",
          landMark: landmark || "",
          pincode,
          city,
          state,
          country,
          phone,
          alternativePhone: alternatePhone || "",
          isDefault: Boolean(isDefault),
        },
        { new: true }
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Address not found",
        });
      }
    } else {
      result = new Address({
        name: userName,
        addressType: type ? type.toLowerCase() : "home",
        flatNumber: addressLine1,
        streetName: addressLine2 || "",
        landMark: landmark || "",
        pincode,
        city,
        state,
        country,
        phone,
        alternativePhone: alternatePhone || "",
        isDefault: Boolean(isDefault),
        userId,
      });

      await result.save();
    }

    return res.status(200).json({
      success: true,
      message: finalAddressId
        ? "Address updated successfully"
        : "Address saved successfully",
      address: result,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send("Server Error");
  }
};

const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const addressId = req.params.id;

    const deleted = await Address.findOneAndDelete({
      _id: addressId,
      userId,
    });

    if (!deleted) {
      return res.status(400).json({
        success: false,
        message: "address not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "address deleted successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send("Server Error");
  }
};

export default {
  loadAddressPage,
  loadAddAddress,
  registerAddress,
  deleteAddress,
};
