import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { propertiesRouter } from './routes/properties.js';
import { mortgageRouter } from './routes/mortgage.js';
import { chatRouter } from './routes/chat.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/properties', propertiesRouter);
app.use('/api', mortgageRouter);
app.use('/api', chatRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
