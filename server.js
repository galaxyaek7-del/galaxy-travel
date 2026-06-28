const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Groq = require('groq-sdk');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_KEY = process.env.GROQ_KEY;
const groq = new Groq({ apiKey: GROQ_KEY || 'missing' });

app.use(cors());
app.use(express.json());

// ── GENERATE BOOK ──
app.post('/generate-book', async (req, res) => {
  const { title, subtitle, type, theme, pages, author } = req.body;

  if (!title) return res.json({ success: false, error: 'Title is required' });

  try {
    const pythonPath = detectPython();
    const bookScript = path.join(__dirname, 'book_generator.py');

    if (!fs.existsSync(bookScript)) {
      return res.status(404).json({ success: false, error: 'book_generator.py not found' });
    }

    const filename = title.replace(/\s+/g, '_').toLowerCase() + '.pdf';
    const outPath = path.join(__dirname, filename);

    const payload = JSON.stringify({
      title: title || 'My Book',
      subtitle: subtitle || '',
      type: type || 'journal',
      theme: theme || 'blue',
      pages: parseInt(pages) || 120,
      author: author || '',
      output: filename
    });

    const python = spawn(pythonPath, [bookScript, '--json'], { cwd: __dirname });

    let output = '', errOut = '';
    python.stdout.on('data', d => { output += d.toString(); });
    python.stderr.on('data', d => { errOut += d.toString(); });
    python.stdin.write(payload);
    python.stdin.end();

    python.on('close', code => {
      try {
        const result = JSON.parse(output.trim());
        if (result.success) {
          res.json({ success: true, filename, pages: result.pages });
        } else {
          res.json({ success: false, error: result.error });
        }
      } catch {
        res.json({ success: false, error: 'Parse error: ' + output + errOut });
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── CHAT ──
app.post('/chat', async (req, res) => {
  const { message, agent } = req.body;
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      max_tokens: 1024,
      messages: [{ role: 'user', content: message }]
    });
    res.json({ success: true, reply: response.choices[0].message.content, agent: agent || 'Scout' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── FINANCE ──
const FINANCE_FILE = path.join(__dirname, 'finance_data.json');
function loadFin() {
  if (!fs.existsSync(FINANCE_FILE)) {
    const init = { sales: [], totalKDP: 0, totalEtsy: 0, totalGumroad: 0 };
    fs.writeFileSync(FINANCE_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(FINANCE_FILE, 'utf8'));
}
function saveFin(data) { fs.writeFileSync(FINANCE_FILE, JSON.stringify(data, null, 2)); }

app.get('/finance', (req, res) => { res.json(loadFin()); });

app.post('/finance/add', (req, res) => {
  const { platform, amount, product, date } = req.body;
  const data = loadFin();
  const sale = {
    id: Date.now(), platform,
    amount: parseFloat(amount),
    product: product || 'Unknown',
    date: date || new Date().toISOString().split('T')[0]
  };
  data.sales.push(sale);
  data.totalKDP = data.sales.filter(s => s.platform === 'KDP').reduce((a, s) => a + s.amount, 0);
  data.totalEtsy = data.sales.filter(s => s.platform === 'Etsy').reduce((a, s) => a + s.amount, 0);
  data.totalGumroad = data.sales.filter(s => s.platform === 'Gumroad').reduce((a, s) => a + s.amount, 0);
  saveFin(data);
  res.json({ success: true, sale });
});

app.delete('/finance/delete/:id', (req, res) => {
  const data = loadFin();
  data.sales = data.sales.filter(s => s.id !== parseInt(req.params.id));
  data.totalKDP = data.sales.filter(s => s.platform === 'KDP').reduce((a, s) => a + s.amount, 0);
  data.totalEtsy = data.sales.filter(s => s.platform === 'Etsy').reduce((a, s) => a + s.amount, 0);
  data.totalGumroad = data.sales.filter(s => s.platform === 'Gumroad').reduce((a, s) => a + s.amount, 0);
  saveFin(data);
  res.json({ success: true });
});

// ── AGENT ENDPOINTS ──
app.post('/api/agent/:name', (req, res) => {
  const { name } = req.params;
  res.json({ success: true, message: `✅ وكيل ${name} اكتمل` });
});

app.post('/api/market-analyze', (req, res) => {
  res.json({ success: true, summary: '📊 تحليل مكتمل — النيش الأفضل: Journals & Planners' });
});

// ── STATIC ──
app.use(express.static(path.join(__dirname)));
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function detectPython() {
  const candidates = ['python3', 'python', 'py'];
  for (const cmd of candidates) {
    try {
      require('child_process').execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch { }
  }
  return 'python';
}

app.listen(PORT, () => {
  console.log(`✅ OpenClaw Factory — http://localhost:${PORT}`);
  console.log(`🔧 Static dir: ${path.join(__dirname)}`);
});