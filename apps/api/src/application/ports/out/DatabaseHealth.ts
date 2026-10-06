export interface DatabaseHealth {
  /** true si la base de datos responde. */
  ping(): Promise<boolean>;
}
