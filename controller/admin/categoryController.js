import category from "../../model/categorySchema.js";

const categoryPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim() || "";

    const query = search
      ? { name: { $regex: search, $options: "i" } }
      : {};

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
      return res.status(400).json({ message: "Category name is required" });
    }
    if (name.length > 12) {
      return res.status(400).json({ message: "Name cannot be more than 12 characters" });
    }
    const existingCategory = await category.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });
    if (existingCategory) {
      return res.status(400).json({ message: "Category already exists" });
    }
    const newCategory = new category({ name: name.trim(), description });
    await newCategory.save();
    res
      .status(201)
      .json({ message: "Category added successfully", category: newCategory });
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
      name: { $regex: new RegExp(`^${name}$`, "i") },
      _id: { $ne: id },
    });
    if (existing) {
      return res.status(400).json({ message: "Category name already exists" });
    }
    if (name.length > 12) {
      return res.status(400).json({ message: "Name cannot be more than 12 characters" });
    }
    const updated = await category.findByIdAndUpdate(
      id,
      { name, description },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "Category not found" });
    }
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
      return res.status(404).json({ message: "Category not found" });
    }
    res.status(200).json({ message: "Category deleted successfully" });
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

const searchCategory = async (req, res) => {
  try {
    const query = req.query.query?.trim();
    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const categories = await category
      .find({
        name: { $regex: query, $options: "i" },
      })
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({ categories });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};


export default { categoryPage, addCategory, editCategory, deleteCategory, listCategory, unlistCategory, searchCategory, };