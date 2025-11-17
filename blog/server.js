const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Post = require("./models/post");
const session = require("express-session");
const bcrypt = require("bcrypt");
const Admin = require("./models/admin");
const dotenv = require("dotenv");


dotenv.config();
const app = express();
const PORT = process.env.PORT;

// Session setup
app.use(
  session({
    secret: "mySecretKey", // change to a strong secret in production
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 } // 1 hour
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Connect MongoDB
connectDB();



// Homepage - show all posts
app.get("/", async (req, res) => {
  try {
    const query = req.query.q;
    const currentPage = parseInt(req.query.page) || 1;
    const postsPerPage = 6;

    // --- Build filter ---
    let filter = {};
    if (query) {
      const regex = new RegExp(query, "i"); // case-insensitive search
      filter = {
        $or: [
          { title: regex },
          { content: regex },
          { category: regex },
          { tags: regex }
        ]
      };
    }

    // --- Get total count for pagination ---
    const totalPosts = await Post.countDocuments(filter);

    // --- Fetch posts with pagination ---
    const posts = await Post.find(filter)
      .skip((currentPage - 1) * postsPerPage)
      .limit(postsPerPage)
      .sort({ date: -1 });

    // --- Render view ---
    res.render("index", {
      title: query ? `Search Results for "${query}"` : "My Blog",
      posts,
      currentPage,
      totalPages: Math.ceil(totalPosts / postsPerPage),
      query,
      post: null
    });

  } catch (err) {
    console.error("Error loading homepage:", err);
    res.status(500).send("Server Error");
  }
});


// About Page
app.get("/about", (req, res) => {
res.render('about', { title: "About Us", post: null });
});

// Contact Page
const Contact = require("./models/contact");
const e = require("express");

// Contact Page
app.get("/contact", (req, res) => {
  res.render("contact", { title: "Contact Us", post: null });
});

// Save Contact Form
app.post("/contact", async (req, res) => {
  try {
    const { username, email, message } = req.body;

    const contact = new Contact({
      username,
      email,
      message
    });

    await contact.save();

    res.send("✅ Thank you for contacting us! We will get back to you soon.");
  } catch (err) {
    console.error("Error saving contact:", err);
    res.status(500).send("❌ Failed to send your message. Please try again.");
  }
});



// Single post page
app.get("/post/:slug", async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug });
    if (!post) return res.status(404).send("Post not found");

    // Find related posts
    let relatedPosts = await Post.find({
      slug: { $ne: post.slug },
      $or: [
        { category: post.category },
        { tags: { $in: post.tags } }
      ]
    }).limit(4);

    res.render("post", {
      post,
      relatedPosts,
      title: post.title
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});



// This route now ONLY handles the redirect.
app.get('/search', (req, res) => {
  const query = req.query.q || '';
  const fragment = req.query.fragment || '';
  
  // It builds the final URL and sends the user there.
  // Example result: /?q=health#posts-section
  res.redirect(`/?q=${encodeURIComponent(query)}#${fragment}`);
});


// Tags Functionality
app.get("/tag/:tag", async (req, res) => {
  try {
    const tag = req.params.tag.toLowerCase();
    const results = await Post.find({ tags: { $regex: new RegExp("^" + tag + "$", "i") } });

    res.render("index", {
      posts: results,
      title: `Tag: ${tag}`,
      currentPage: 1,
      totalPages: 1,
      query: null,
      post: null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});




// Admin - Add Post (form page)
app.get("/admin/add-post", isAuthenticated, (req, res) => {
  res.render("admin/add-post", { title: "Add Post", post: null });
});

// Admin - Save New Post
app.post("/admin/add-post", isAuthenticated, async (req, res) => {
  try {
    const { title, slug, meta_description, author, category, tags, image, content} = req.body;

    const post = new Post({
      title,
      category,
      tags: tags ? tags.split(",").map(tag => tag.trim()) : [],
      image,
      content,
      slug,
      meta_description,
      author
    });

    await post.save();

    res.redirect("/"); // After adding, go to homepage
  } catch (err) {
    console.error("Error saving post:", err);
    res.status(500).send("❌ Failed to save post.");
  }
});



// Admin Dashboard - list posts
app.get("/admin/dashboard", isAuthenticated, async (req, res) => {
  try {
    const posts = await Post.find().sort({ date: -1 }); // latest first
    res.render("admin/dashboard", { title: "Admin Dashboard", posts });
  } catch (err) {
    console.error("Error loading dashboard:", err);
    res.status(500).send("❌ Failed to load dashboard.");
  }
});

// Edit Post - show form
app.get("/admin/edit-post/:id", isAuthenticated, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).send("Post not found");

    res.render("admin/edit-post", { title: "Edit Post", post });
  } catch (err) {
    console.error("Error loading edit post:", err);
    res.status(500).send("❌ Failed to load post for editing.");
  }
});

// Edit Post - update in DB
app.post("/admin/edit-post/:id", isAuthenticated, async (req, res) => {
  try {
    const { title, category, tags, image, content } = req.body;

    await Post.findByIdAndUpdate(req.params.id, {
      title,
      category,
      tags: tags ? tags.split(",").map(tag => tag.trim()) : [],
      image,
      content
    });

    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("Error updating post:", err);
    res.status(500).send("❌ Failed to update post.");
  }
});

// Delete Post
app.post("/admin/delete-post/:id", isAuthenticated, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).send("❌ Failed to delete post.");
  }
});



// Login Page
app.get("/admin/login", (req, res) => {
  res.render("admin/login", { title: "Admin Login", error: null });
});

// Handle Login
// Login route
app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await Admin.findOne({ username });

    if (!admin) {
      return res.status(401).send("❌ Invalid credentials");
    }

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
      return res.status(401).send("❌ Invalid credentials");
    }

    // Store session
    req.session.isAdmin = true;
    req.session.username = admin.username;

    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("❌ Server error");
  }
});

// Logout
app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});


app.get("/admin/register",isAuthenticated, (req, res) => {
  res.send(`
    <form action="/admin/register" method="POST">
      <input type="text" name="username" placeholder="Username" required />
      <input type="password" name="password" placeholder="Password" required />
      <button type="submit">Register</button>
    </form>
  `);
});

app.post("/admin/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const newAdmin = new Admin({ username, password });
    await newAdmin.save();
    res.send("✅ Admin registered successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Failed to register admin");
  }
});




function isAuthenticated(req, res, next) {
  if (req.session.isAdmin) {
    return next();
  }
  res.redirect("/admin/login");
}


// Dynamic Sitemap
app.get("/sitemap.xml", async (req, res) => {
  try {
    const baseURL = process.env.BASE_URL || "https://yourdomain.com"; // Add BASE_URL to .env
    const posts = await Post.find().select("slug date").sort({ date: -1 });

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;

    // Static pages
    const staticPages = [
      { url: "/", priority: "1.0", changefreq: "daily" },
      { url: "/about", priority: "0.8", changefreq: "monthly" },
      { url: "/contact", priority: "0.7", changefreq: "monthly" }
    ];

    staticPages.forEach(page => {
      sitemap += `  <url>
    <loc>${baseURL}${page.url}</loc>
    <priority>${page.priority}</priority>
    <changefreq>${page.changefreq}</changefreq>
  </url>
`;
    });

    // Dynamic post pages
    posts.forEach(post => {
      sitemap += `  <url>
    <loc>${baseURL}/post/${post.slug}</loc>
    <lastmod>${post.date.toISOString().split('T')[0]}</lastmod>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
  </url>
`;
    });

    sitemap += `</urlset>`;

    res.type("application/xml");
    res.send(sitemap);
  } catch (err) {
    console.error("Error generating sitemap:", err);
    res.status(500).send("Error generating sitemap");
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
