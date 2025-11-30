import category from "../../model/categorySchema.js";

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
    res.status(500).send("Server Error");
  }
};

const addCategory = async (req, res) => {
  const { name, description } = req.body;
  try {
    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    if (!categoryNameRegex.test(name.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "Category name must be 2-20 characters long and contain only letters",
      });
    }

    if (description && description.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Description cannot exceed 200 characters",
      });
    }

    const existingCategory = await category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category already exists",
      });
    }
    const newCategory = new category({ name: name.trim(), description });
    await newCategory.save();
    res.status(201).json({
      success: true,
      message: "Category added successfully",
      category: newCategory,
    });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const editCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const id = req.params.id;

    const existing = await category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
      _id: { $ne: id },
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Category name already exists",
      });
    }

    if (!categoryNameRegex.test(name.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "Category name must be 2-20 characters long and contain only letters",
      });
    }

    if (description && description.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Description cannot exceed 200 characters",
      });
    }

    category.name = name.trim();
    category.description = description?.trim() || "";

    await category.save();
    res
      .status(200)
      .json({ message: "Category updated successfully", category: updated });
  } catch (error) {
    console.error("Error editing category:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await category.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ message: "Server Error" });
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
      return res.status(404).json({ message: "Category not found" });
    }
    res.status(200).json({
      success: true,
      message: "Category listed successfully",
      category,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
      return res.status(404).json({ message: "Category not found" });
    }
    res.status(200).json({
      success: true,
      message: "Category unlisted successfully",
      category,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default { categoryPage, addCategory, editCategory, deleteCategory, listCategory, unlistCategory};
