/**
 * 行为命令基类。继承并实现 execute() 来封装单个业务动作。
 */
export abstract class Command {
  abstract execute(): void;
}
