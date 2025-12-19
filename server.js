// server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateQuiz } from './generator.js'; 

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

// --- Game State ---
let currentQuiz = []; 
let currentQuestionIndex = -1; 
let players = {}; // Stores active players
let isGameActive = false;

// --- Setup ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.static('public'));

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// --- Socket Logic ---
io.on('connection', (socket) => {
    
    // 1. Join
    socket.on('join_lobby', (name) => {
        // Allow joining even if game is active, just start with 0 score
        players[socket.id] = { name: name, score: 0, answered: false };
        console.log(`${name} joined! Total: ${Object.keys(players).length}`);
        io.emit('update_players', Object.values(players)); 
    });

    // 2. Submit Answer
    socket.on('submit_answer', (answerIndex) => {
        const player = players[socket.id];
        const question = currentQuiz[currentQuestionIndex];

        // Ensure player exists and hasn't answered this specific question yet
        if (player && !player.answered && isGameActive) {
            player.answered = true;
            
            // Compare answers (Using parseInt to be safe)
            const isCorrect = parseInt(answerIndex) === parseInt(question.correctIndex);

            console.log(`Player ${player.name} answered ${answerIndex}. Correct: ${question.correctIndex}. Result: ${isCorrect}`);

            if (isCorrect) {
                player.score += 10; 
                socket.emit('answer_result', { correct: true, score: player.score });
            } else {
                socket.emit('answer_result', { correct: false, score: player.score });
            }

            // Update Leaderboard immediately after every answer
            updateLeaderboard(); 
        } else {
            // Debugging: Why didn't it work?
            if(!player) console.log("Error: Player not found in memory (Ghost Player).");
            if(player && player.answered) console.log("Player already answered.");
        }
    });

    // 3. Admin Controls
    socket.on('admin_next_question', () => startNextQuestion());
});

// --- Helper Functions ---
function updateLeaderboard() {
    const leaderboard = Object.values(players)
        .sort((a, b) => b.score - a.score) 
        .slice(0, 10); 
    io.emit('update_leaderboard', leaderboard);
}

function startNextQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex < currentQuiz.length) {
        isGameActive = true;
        
        // Reset 'answered' status for all players for the new question
        Object.keys(players).forEach(id => players[id].answered = false);

        const q = currentQuiz[currentQuestionIndex];
        
        io.emit('new_question', {
            index: currentQuestionIndex,
            question: q.question,
            options: q.options
        });
        
        console.log(`\n--- Question ${currentQuestionIndex + 1} Started ---`);
        console.log(`Correct Answer Index: ${q.correctIndex}`);

    } else {
        isGameActive = false;
        io.emit('game_over');
    }
}

// --- Generator Route ---
app.post('/admin/load-quiz', express.json(), async (req, res) => {
    if (!req.body.mom) return res.status(400).send({ message: "No text provided" });

    const quizData = await generateQuiz(req.body.mom);
    
    if (quizData) {
        currentQuiz = quizData;
        currentQuestionIndex = -1;
        
        // FIX: DO NOT wipe players = {}. Just reset their scores.
        Object.keys(players).forEach(id => {
            players[id].score = 0;
            players[id].answered = false;
        });

        io.emit('quiz_loaded', { questionCount: currentQuiz.length });
        // Force an update to player count on admin screen
        io.emit('update_players', Object.values(players)); 
        
        res.send({ success: true, message: "Quiz Loaded" });
    } else {
        res.status(500).send({ success: false, message: "AI Failed" });
    }
});

httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));