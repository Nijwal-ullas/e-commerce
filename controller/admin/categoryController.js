import category from "../../model/categorySchema.js";
import product from "../../model/productSchema.js";
import statusCode from "../../utilities/statusCodes.js";
import errorMessage from "../../utilities/errorMessages.js";

const categoryNameRegex = /^[A-Za-z ]{2,20}$/;

const categoryPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim() || "";

    const query = search ? { name: { $regex: search, $options: "i" } } : {};

    const totalCategories = await category.countDocuments(query);

    const categories = await category
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render("admin/categoryPage", {
      categories,
      currentPage: page,
      totalPages: Math.ceil(totalCategories / limit),
      totalCategories,
      search,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const addCategory = async (req, res) => {
  const { name, description, offer } = req.body;
  try {
    if (!name || name.trim() === "") {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Category name is required",
      });
    }

    if (!categoryNameRegex.test(name.trim())) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message:
          "Category name must be 2-20 characters long and contain only letters",
      });
    }

    if (description && description.length > 200) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Description cannot exceed 200 characters",
      });
    }

    const offerValue = parseInt(offer) || 0;

    if (offerValue <= 0 || offerValue >= 100) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Offer percentage must be between 1 and 99",
      });
    }

    const existingCategory = await category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });
    if (existingCategory) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Category already exists",
      });
    }

    const newCategory = new category({
      name: name.trim(),
      description: description.trim(),
      offer: offerValue,
    });
    await newCategory.save();
    res.status(statusCode.CREATED).json({
      success: true,
      message: "Category added successfully",
      category: newCategory,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const editCategory = async (req, res) => {
  try {
    const { name, description, offer } = req.body;
    const id = req.params.id;

    const existing = await category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
      _id: { $ne: id },
    });

    if (existing) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Category name already exists",
      });
    }

    if (!categoryNameRegex.test(name.trim())) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message:
          "Category name must be 2-20 characters long and contain only letters",
      });
    }

    if (description && description.length > 200) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Description cannot exceed 200 characters",
      });
    }

    const offerValue = parseInt(offer) || 0;

    if (offerValue <= 0 || offerValue >= 100) {
      return res.status(statusCode.BAD_REQUEST).json({
        success: false,
        message: "Offer percentage must be between 1 and 99",
      });
    }

    const products = await product.find({ category: id });

    if (products.length > 0) {
      for (const prod of products) {
        prod.VariantItem = prod.VariantItem.map((variant) => {
          const basePrice = variant.Price;

          const productDiscount = prod.discount || 0;

          const categoryDiscount = offerValue;

          const highestDiscount = Math.max(productDiscount, categoryDiscount);

          const discountAmount = (basePrice * highestDiscount) / 100;
          const newOfferPrice = basePrice - discountAmount;

          return {
            ...variant.toObject(),
            offerPrice: newOfferPrice,
          };
        });

        await prod.save();
      }
    }

    const updated = await category.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        description: description?.trim() || "",
        offer: offerValue,
      },
      { new: true }
    );

    if (!updated) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(statusCode.OK).json({
      message: "Category updated successfully",
      category: updated,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await category.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(statusCode.NOT_FOUND).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(statusCode.OK).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const listCategory = async (req, res) => {
  try {
    const cat = await category.findByIdAndUpdate(
      req.params.id,
      { isListed: true },
      { new: true }
    );
    if (!cat) {
      return res
        .status(statusCode.NOT_FOUND)
        .json({ success: false, message: "Category not found" });
    }
    res.status(statusCode.OK).json({
      success: true,
      message: "Category listed successfully",
      category,
    });
  } catch (error) {
    console.error(error.message);
    res.status(statusCode.SERVER_ERROR).json({
      success: false,
      message: errorMessage.SERVER_ERROR,
    });
  }
};

const unlistCategory = async (req, res) => {
  try {
    const cat = await category.findByIdAndUpdate(
      req.params.id,
      { isListed: false },
      { new: true }
    );
    if (!cat) {
      return res
        .status(statusCode.NOT_FOUND)
        .json({ success: false, message: "Category not found" });
    }
    res.status(statusCode.OK).json({
      success: true,
      message: "Category unlisted successfully",
      category,
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
  categoryPage,
  addCategory,
  editCategory,
  deleteCategory,
  listCategory,
  unlistCategory,
};
