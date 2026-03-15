import { Model } from './Model';
import { Command } from './Command';

/**
 * IOC 容器：注册、获取模型；派发命令。
 */
export class Arch {
  private static _models: Map<string, Model> = new Map();

  /** 注册单例模型 */
  static register(model: Model) {
    if (!model.key) throw new Error('Model.key 不能为空');
    Arch._models.set(model.key, model);
  }

  /** 获取模型实例 */
  static get<T extends Model>(key: string): T {
    return Arch._models.get(key) as T;
  }

  /** 派发命令 */
  static send(cmd: Command) {
    cmd.execute();
  }
}
