import express from "express";
import cors from "cors";
import { configDotenv } from "dotenv";
import runMediaSoupServer from "./server/mediaServer";
configDotenv();
const app = express();
app.use(cors());
app.use(express.static("public"));
runMediaSoupServer(app);
