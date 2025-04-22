import express from "express";
import cors from "cors";
import runMediaSoupServer from "./server/mediaServer";

const app = express();
app.use(cors());
app.use(express.static("public"));

runMediaSoupServer(app)
