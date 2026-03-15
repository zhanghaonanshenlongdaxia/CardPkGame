export abstract class Model {
  /** 唯一标识 */
  abstract readonly key: string;
  /** 初始化数据 */
  onInit?(): void;
}
