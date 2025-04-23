import os from "node:os"; //operating system module. part of node
import { config } from "./config";
import { createWorker } from "mediasoup";
import { Worker } from "mediasoup/types";

const totalThreads = os.cpus().length; //maximum number of allowed workers
// console.log(totalThreads)

export const createWorkers = () =>
  new Promise<Worker[]>(async (resolve, _reject) => {
    let workers: Worker[] = [];
    //loop to create each worker
    for (let i = 0; i < totalThreads; i++) {
      const worker = await createWorker({
        //rtcMinPort and max are just arbitray ports for our traffic
        //useful for firewall or networking rules
        rtcMinPort: config.workerSettings.rtcMinPort,
        rtcMaxPort: config.workerSettings.rtcMaxPort,
        // @ts-ignore
        logLevel: config.workerSettings.logLevel,
        // @ts-ignore
        logTags: config.workerSettings.logTags,
      });
      worker.on("died", () => {
        //this should never happen, but if it does, do x...
        console.log("Worker has died");
        process.exit(1); //kill the node program
      });
      workers.push(worker);
    }

    resolve(workers);
  });
