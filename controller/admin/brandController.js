import Brand from "../../model/brandSchema.js";
import Product from "../../model/productSchema.js"; 

const brandPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim() || "";

    let query = {};
    if (search) {
      query = {
        name: { $regex: search, $options: "i" }
      };
    }

    const totalBrands = await Brand.countDocuments(query);

    const brands = await Brand.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalBrands / limit);

    res.render("admin/brandPage", {
      brands,
      currentPage: page,
      totalPages,
      totalBrands,
      search,            
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
};


const searchBrand = async (req, res) => {
  try {
    const query = req.query.query?.trim();
    if (!query) return res.json({ brands: [] });

    const brands = await Brand.find({
      name: { $regex: query, $options: 'i' },
    })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({ brands });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ message: 'Search error' });
  }
};


const addBrand = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Brand name is required' });
    }

    const existingBrand = await Brand.findOne({ name });
    if (existingBrand) {
      return res.status(400).json({ message: 'Brand already exists' });
    }

    let brandLogo = '';
    if (req.file) {
      brandLogo = `/uploads/re-image/${req.file.filename}`;
    }

    const brand = new Brand({
      name,
      description,
      brandLogo,
    });

    await brand.save();
    res.status(201).json({ message: 'Brand added successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
};


const editBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Brand name is required' });
    }

    let updateData = { name, description };
    if (req.file) {
      updateData.brandLogo = `/uploads/re-image/${req.file.filename}`;
    }

    const brand = await Brand.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    res.json({ message: 'Brand updated successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const productCount = await Product.countDocuments({ brand: id });

    if (productCount > 0) {
      return res.status(400).json({
        message: 'Cannot delete brand; it is associated with products',
      });
    }

    const brand = await Brand.findByIdAndDelete(id);
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    res.json({ message: 'Brand deleted successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

export default { brandPage, searchBrand, addBrand, editBrand, deleteBrand };
