import * as express from 'express';
import { TfsVstsController } from './controllers';

const app: express.Application = express();
const port: number = 3000;

app.use('/tfsvsts', TfsVstsController);

app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}/`);
});