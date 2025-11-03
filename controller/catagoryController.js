import catagory from "../model/catagorySchema.js";

const catagoryPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;

    const totalCategories = await catagory.countDocuments();
    const categories = await catagory.find().skip(skip).limit(limit);

    res.render("admin/catagoryPage", {
      categories,
      currentPage: page,
      totalPages: Math.ceil(totalCategories / limit),
      totalCategories, // ✅ added this
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
};


const addCatagory = async (req, res) => {
  const { name, description } = req.body;
  try {
    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Category name is required" });
    }
    const existingCategory = await catagory.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });
    if (existingCategory) {
      return res.status(400).json({ message: "Category already exists" });
    }
    const newCategory = new catagory({ name: name.trim(), description });
    await newCategory.save();
    res
      .status(201)
      .json({ message: "Category added successfully", category: newCategory });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const editCatagory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const id = req.params.id;

    const existing = await catagory.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      _id: { $ne: id },
    });
    if (existing) {
      return res.status(400).json({ message: "Category name already exists" });
    }
    const updated = await catagory.findByIdAndUpdate(
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

const deleteCatagory = async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await catagory.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const listCatagory = async (req, res) => {
  try {
    const category = await catagory.findByIdAndUpdate(
      req.params.id,
      { isListed: true },
    );
    res.status(200).json({ success: true, message: "Are you sure to list this Catagory..?"});
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const unlistCatagory = async (req, res) => {
  try {
    const category = await catagory.findByIdAndUpdate(
      req.params.id,
      { isListed: false },
    );
    res.status(200).json({ success: true, message: "Are you sure to unlist this Catagory..?"});
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};



export default { catagoryPage, addCatagory, editCatagory, deleteCatagory,listCatagory,unlistCatagory };
