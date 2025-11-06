import user from "../../model/userSchema.js";

const customerInfo = async (req, res) => {
  try {
    let search = req.query.search || "";
    let page = parseInt(req.query.page) || 1;
    const limit = 5;
    const users = await user
      .find({
        $or: [
          { name: { $regex: ".*" + search + ".*", $options: "i" } },
          { email: { $regex: ".*" + search + ".*", $options: "i" } },
        ],
      })
      .sort({createdAt : -1})
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();
    const count = await user.countDocuments({
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    });
    res.render("admin/customers", {
      users,
      totalUsers: count,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      limit,
      search,
    });
  } catch (error) {
    console.error("Error loading customers:", error);
    res.status(500).send("Server Error");
  }
};

const blockCustomer = async (req, res) => {
  try {
    const userId = req.query.id;
    await user.updateOne({ _id: userId }, { $set: { isBlocked: true } });
    res.redirect("/admin/users");
  } catch (error) {
    console.error("Error loading customers:", error);
    res.status(500).send("Server Error");
  }
};

const unblockCustomer = async (req, res) => {
  try {
    const userId = req.query.id;
    await user.updateOne({ _id: userId }, { $set: { isBlocked: false } });
    res.redirect("/admin/users");
  } catch (error) {
    console.error("Error loading customers:", error);
    res.status(500).send("Server Error");
  }
};




const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const deletedUser = await user.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ success: false, message: "Server error deleting user" });
  }
};

export default { customerInfo, blockCustomer, unblockCustomer, deleteUser };
