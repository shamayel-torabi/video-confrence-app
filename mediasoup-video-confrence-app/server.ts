import express from "express";
import compression from 'compression';
import sirv from 'sirv'
import config from "./vite.config.ts";
import { createServer } from "vite";
import runMediaSoupServer from './server/mediaSoupServer.ts'

// Constants
const isProduction = process.env.NODE_ENV === "production";
const base = process.env.BASE || "/";


// Create http server
const app = express();

if (!isProduction) {
  const vite = await createServer(config);
  app.use(vite.middlewares);
} else {
  app.use(compression());
  app.use(base, sirv("./dist", { extensions: [] }));
  app.use(express.static('dist'))
}

runMediaSoupServer(app)
