// Carregadores para os testes de Node (Node não faz import de .json sem import attributes; aqui é fs puro).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ler = (p: string) => JSON.parse(readFileSync(join(RAIZ, p), 'utf8'));

const CAMPOS = ['id', 'nome', 'grupo', 'porcao', 'kcal', 'prot', 'carb', 'gord', 'fibra', 'ferro', 'calcio', 'sodio', 'zinco', 'leucina', 'flags'];

export function alimentos() {
  return ler('data/foods.json').alimentos.map((a: any[]) => {
    if (!Array.isArray(a)) return a;
    const o: Record<string, any> = {}; CAMPOS.forEach((k, i) => (o[k] = a[i])); return o;
  });
}
export function fontes() {
  return ['nutrition', 'training', 'lifestyle'].flatMap((f) => ler(`data/sources/${f}.json`).fontes);
}
export const capsulas = () => ler('data/faq.json').capsulas;
export const exercises = () => ler('data/exercises.json').exercicios;
export const program = () => ler('data/program.json');
export const audits = () => ler('data/audits.json');
export const meals = () => ler('data/meals.json');
export const auditoriaBase = () => ler('data/audits.json');
