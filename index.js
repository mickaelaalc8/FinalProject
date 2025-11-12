require('dotenv').config(); // Load environment variables from .env
const mongoose = require('mongoose');
const express = require('express');
const { body, validationResult } = require('express-validator'); 
const app = express();

// Middleware: Required to parse incoming JSON request bodies
app.use(express.json());

// --- Helper Functions ---

// Generates a random number and takes a substring of the desired length
function generateRandomDigits(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += Math.floor(Math.random() * 10).toString();
    }
    return result;
}

// Generates Student Number in XX-XXXXX-XXX format
function generateStudentNo() {
    const block1 = generateRandomDigits(2); // XX
    const block2 = generateRandomDigits(5); // XXXXX
    const block3 = generateRandomDigits(3); // XXX
    return `${block1}-${block2}-${block3}`;
}

// --- 1. Mongoose Schema and Model ---

const studentSchema = new mongoose.Schema({
    // Student Number will be unique and required
    studentNo: { 
        type: String, 
        required: true, 
        unique: true, 
        match: /^\d{2}-\d{5}-\d{3}$/ 
    },
    name: { 
        type: String, 
        required: true, 
        minlength: 3 
    },
    course: { 
        type: String, 
        required: true, 
        // Use enum to enforce the allowed courses, matching your validation
        enum: ['CS', 'IT', 'BA', 'ENG'] 
    },
    yearLevel: { 
        type: Number, 
        required: true, 
        min: 1, 
        max: 4 
    },
    section: { 
        type: String, 
        required: true, 
        minlength: 1, 
        maxlength: 10 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true, // Ensure emails are unique
        lowercase: true, // Store emails in lowercase for consistency
        trim: true
    },
}, { 
    // Mongoose option to automatically add createdAt and updatedAt fields
    timestamps: true 
});

// Create the Model, which will be used to interact with the 'students' collection in MongoDB
const Student = mongoose.model('Student', studentSchema);


// --- 2. Express-Validator Middleware Array (Validation Rules) ---
const studentNoPattern = /^\d{2}-\d{5}-\d{3}$/; 

// Validation rules for POST and PUT (all fields required)
const validateStudentRules = [
    body('studentNo')
        .optional() 
        .matches(studentNoPattern)
        .withMessage('Student Number must be a string in the format XX-XXXXX-XXX (e.g., 23-12902-588).'),

    body('name')
        .isString()
        .isLength({ min: 3 })
        .withMessage('Name must be at least 3 characters long.'),
    body('course')
        .isIn(['CS', 'IT', 'BA', 'ENG'])
        .withMessage('Course must be one of: CS, IT, BA, or ENG.'),
    body('yearLevel')
        .isInt({ min: 1, max: 4 })
        .withMessage('Year level must be an integer between 1 and 4.'),
    body('section')
        .isString()
        .isLength({ min: 1, max: 10 })
        .withMessage('Section is required and must be between 1 and 10 characters.'),
    body('email')
        .isEmail()
        .withMessage('Must be a valid email address.'),
];

// Validation rules for PATCH (all fields are optional, but if present, they must be valid)
const validatePartialUpdateRules = [
    body('name')
        .optional()
        .isString()
        .isLength({ min: 3 })
        .withMessage('Name must be at least 3 characters long.'),
    body('course')
        .optional()
        .isIn(['CS', 'IT', 'BA', 'ENG'])
        .withMessage('Course must be one of: CS, IT, BA, or ENG.'),
    body('yearLevel')
        .optional()
        .isInt({ min: 1, max: 4 })
        .withMessage('Year level must be an integer between 1 and 4.'),
    body('section')
        .optional()
        .isString()
        .isLength({ min: 1, max: 10 })
        .withMessage('Section must be between 1 and 10 characters.'),
    body('email')
        .optional()
        .isEmail()
        .withMessage('Must be a valid email address.'),
];

// --- 3. Validation Result Handler Middleware ---
const checkValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};


// ==============================================================================
// 4. CORE CRUD ROUTES
// ==============================================================================

// --- GET /api/students: Retrieve all students ---
app.get('/api/students', async (req, res) => {
    try {
        const students = await Student.find();
        res.send(students);
    } catch (err) {
        console.error("Error retrieving all students:", err);
        res.status(500).send({ message: 'Error retrieving students from database.', error: err.message });
    }
});

// --- GET /api/students/filter?{field}={value}: Retrieve all students matching a query filter ---
app.get('/api/students/filter', async (req, res) => {
    try {
        const { course, yearLevel, section } = req.query;
        const query = {}; // MongoDB query object

        if (course) {
            query.course = course.toUpperCase();
        }
        
        if (yearLevel) {
            const level = parseInt(yearLevel);
            if (!isNaN(level)) {
                 query.yearLevel = level;
            }
        }

        if (section) {
            query.section = section.toUpperCase();
        }
        
        const filteredStudents = await Student.find(query);

        if (filteredStudents.length === 0) {
            return res.status(404).send({ message: 'No students found matching the provided filter criteria.' });
        }
        res.send(filteredStudents);
    } catch (err) {
        console.error("Error filtering students:", err);
        res.status(500).send({ message: 'Error filtering students from database.', error: err.message });
    }
});

//hello
// --- GET /api/students/search?q=...: Search by name or email ---
app.get('/api/students/search', async (req, res) => {
    try {
        const query = req.query.q;

        if (!query) {
            return res.status(400).send({ message: 'Search query (q) is required.' });
        }

        const regex = new RegExp(query, 'i'); // 'i' for case-insensitive

        // Use $or to search across multiple fields (name OR email)
        const filteredStudents = await Student.find({
            $or: [
                { name: { $regex: regex } },
                { email: { $regex: regex } }
            ]
        });

        if (filteredStudents.length === 0) {
            return res.status(404).send({ message: `No students found matching '${query}' in name or email.` });
        }

        res.send(filteredStudents);
    } catch (err) {
        console.error("Error searching students:", err);
        res.status(500).send({ message: 'Error searching students from database.', error: err.message });
    }
});


// --- GET /api/students/:studentNo: Retrieve a single student ---
// --- GET /api/students/:studentNo: Retrieve a single student ---
app.get('/api/students/:studentNo', async (req, res) => {
    try {
        const student = await Student.findOne({ studentNo: req.params.studentNo });
        if (!student) {
            return res.status(404).send({ message: 'The student with the given Student Number was not found.' });
        }
        res.send(student);
    } catch (err) {
        res.status(500).send({ message: 'Error retrieving student.', error: err.message });
    }
});


// --- POST /api/students: Create a new student ---
app.post('/api/students', validateStudentRules, checkValidation, async (req, res) => {
    try {
        // 1. Generate unique student number in XX-XXXXX-XXX format.
        let newStudentNo;
        let isUnique = false;
        // Loop to ensure the generated student number is unique (important for high-volume creation)
        for (let i = 0; i < 10; i++) { // Try up to 10 times to generate a unique number
            const generatedNo = generateStudentNo();
            const existing = await Student.findOne({ studentNo: generatedNo });
            if (!existing) {
                newStudentNo = generatedNo;
                isUnique = true;
                break;
            }
        }

        if (!isUnique) {
            return res.status(500).send({ message: 'Could not generate a unique student number. Try again.' });
        }

        // 2. Create and Save (to MongoDB)
        const newStudent = new Student({
            studentNo: newStudentNo, 
            name: req.body.name,
            course: req.body.course,
            yearLevel: req.body.yearLevel,
            section: req.body.section, 
            email: req.body.email,
        });

        await newStudent.save();

        // 3. Respond with 201 Created
        res.status(201).send(newStudent);
    } catch (err) {
        // Handle potential errors like duplicate email or schema validation errors
        if (err.code === 11000) {
            return res.status(400).send({ message: 'An email or student number already exists.', error: err.message });
        }
        res.status(500).send({ message: 'Error creating student record.', error: err.message });
    }
});

// --- PUT /api/students/:studentNo: Update an existing student (Full replacement) ---
app.put('/api/students/:studentNo', validateStudentRules, checkValidation, async (req, res) => {
    try {
        // Find by studentNo and update with the entire req.body
        const student = await Student.findOneAndUpdate(
            { studentNo: req.params.studentNo },
            { $set: req.body }, // Use $set to replace only the provided fields (but all are provided and validated)
            { new: true, runValidators: true } // Return the modified doc, enforce schema validators
        );
        
        if (!student) {
            return res.status(404).send({ message: 'The student with the given Student Number was not found.' });
        }

        // Respond with the updated student
        res.send(student);
    } catch (err) {
        if (err.code === 11000) { // Duplicate key error (e.g., trying to use an existing email)
            return res.status(400).send({ message: 'An email already exists.', error: err.message });
        }
        console.error("Error updating student (PUT):", err);
        res.status(500).send({ message: 'Error updating student record.', error: err.message });
    }
});

// --- PATCH /api/students/:studentNo: Update partial information ---
app.patch('/api/students/:studentNo', validatePartialUpdateRules, checkValidation, async (req, res) => {
    try {
        // Find by studentNo and update with the fields in req.body
        const student = await Student.findOneAndUpdate(
            { studentNo: req.params.studentNo },
            { $set: req.body }, // $set is perfect for partial updates (PATCH)
            { new: true, runValidators: true } // Return the modified doc, enforce schema validators
        );
        
        if (!student) {
            return res.status(404).send({ message: 'The student with the given Student Number was not found.' });
        }

        // Respond with the updated student
        res.send(student);
    } catch (err) {
        if (err.code === 11000) { // Duplicate key error
            return res.status(400).send({ message: 'An email already exists.', error: err.message });
        }
        console.error("Error updating student (PATCH):", err);
        res.status(500).send({ message: 'Error updating student record.', error: err.message });
    }
});


// --- DELETE /api/students/:studentNo: Delete a student ---
app.delete('/api/students/:studentNo', async (req, res) => {
    try {
        // 1. Find and Delete the student by studentNo
        const result = await Student.deleteOne({ studentNo: req.params.studentNo });
        
        // Check if a document was actually deleted
        if (result.deletedCount === 0) {
            return res.status(404).send({ message: 'The student with the given Student Number was not found.' });
        }

        // 2. Respond with a clear success message
        res.send({ message: 'The student record was successfully removed.' });

    } catch (err) {
        // Handle potential database errors
        console.error("Error deleting student:", err);
        res.status(500).send({ message: 'Internal Server Error during deletion.' });
    }
});


// --- Vercel/Root Route (Optional, but helps prevent 404s on the root path) ---
app.get('/', (req, res) => {
    res.send({ message: 'Student API is running. Access /api/students for data.' });
});


// --- Server Listener & MongoDB Connection (Updated for Vercel/Local) ---
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// We only listen for connections locally; Vercel handles the listener itself.
if (process.env.VERCEL_ENV !== 'production') {
    if (!MONGODB_URI) {
        console.error('FATAL ERROR: MONGODB_URI is not defined in environment variables.');
        // Don't exit here for Vercel builds, only local testing
        if (!process.env.VERCEL_ENV) {
            process.exit(1);
        }
    }
    
    mongoose.connect(MONGODB_URI)
        .then(() => {
            console.log('Connected to MongoDB successfully!');
            app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}/api/students`));
        })
        .catch(err => {
            console.error('Could not connect to MongoDB:', err.message);
            // Don't exit here for Vercel builds
            if (!process.env.VERCEL_ENV) {
                 process.exit(1);
            }
        });
}

// *** CRITICAL FIX FOR VERCEL DEPLOYMENT ***
// Vercel expects an Express app to be exported for the serverless function.
module.exports = app;