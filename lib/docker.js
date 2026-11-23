import { runSSH } from './ssh';

/**
 * Lista containers Docker rapidamente sem usar `--format '{{json .}}'` (que pode travar no daemon).
 */
export async function listDockerContainers(all = false) {
  const flag = all ? ' -a' : '';
  const result = await runSSH(`docker ps${flag} --format '{{.Names}}\\t{{.Status}}\\t{{.Ports}}'`);
  if (result.code !== 0) {
    throw new Error(all ? 'Falha ao consultar todos os contêineres Docker.' : 'Falha ao consultar contêineres Docker.');
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [Names = '', Status = '', Ports = ''] = line.split('\t');
      return Names ? { Names, Status, Ports } : null;
    })
    .filter(Boolean);
}
