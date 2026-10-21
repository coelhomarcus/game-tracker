// Cria os jogos sintéticos no banco de TESTE, para os testes de integração do app (mobile/).
//   npm run test:seed   (usa backend/.env.test)
import { ensureSyntheticGames } from '../test/helpers/seed';

ensureSyntheticGames().then(
  () => {
    console.log('Jogos sintéticos 900001 e 900002 garantidos.');
    process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
