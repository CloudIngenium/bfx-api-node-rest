declare module 'bfx-api-node-models' {
   
  class Model {
    constructor(...args: any[]) // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped external package
    serialize(): unknown[]
    [key: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  export class FundingCredit extends Model {}
  export class FundingLoan extends Model {}
  export class FundingOffer extends Model {}
  export class FundingTrade extends Model {}
  export class MarginInfo extends Model {}
  export class Order extends Model {
    static type: Record<string, string>
    static flags: Record<string, number>
    toNewOrderPacket(): Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  export class Position extends Model {}
  export class Trade extends Model {}
  export class PublicTrade extends Model {}
  export class TradingTicker extends Model {}
  export class TradingTickerHist extends Model {}
  export class FundingTicker extends Model {}
  export class FundingTickerHist extends Model {}
  export class Wallet extends Model {}
  export class WalletHist extends Model {}
  export class Alert extends Model {}
  export class Candle extends Model {}
  export class Movement extends Model {}
  export class MovementInfo extends Model {}
  export class LedgerEntry extends Model {}
  export class Liquidations extends Model {}
  export class UserInfo extends Model {}
  export class Currency extends Model {}
  export class StatusMessagesDeriv extends Model {}
  export class Notification extends Model {
    notifyInfo: unknown[]
  }
  export class Login extends Model {}
  export class ChangeLog extends Model {}
  export class Invoice extends Model {}
  export class SymbolDetails extends Model {}
  export class TransactionFee extends Model {}
  export class AccountSummary extends Model {}
  export class AuthPermission extends Model {}
  export class CoreSettings extends Model {}
  export class WeightedAverages extends Model {}

  const Models: {
    FundingCredit: typeof FundingCredit
    FundingLoan: typeof FundingLoan
    FundingOffer: typeof FundingOffer
    FundingTrade: typeof FundingTrade
    MarginInfo: typeof MarginInfo
    Order: typeof Order
    Position: typeof Position
    Trade: typeof Trade
    PublicTrade: typeof PublicTrade
    TradingTicker: typeof TradingTicker
    TradingTickerHist: typeof TradingTickerHist
    FundingTicker: typeof FundingTicker
    FundingTickerHist: typeof FundingTickerHist
    Wallet: typeof Wallet
    WalletHist: typeof WalletHist
    Alert: typeof Alert
    Candle: typeof Candle
    Movement: typeof Movement
    MovementInfo: typeof MovementInfo
    LedgerEntry: typeof LedgerEntry
    Liquidations: typeof Liquidations
    UserInfo: typeof UserInfo
    Currency: typeof Currency
    StatusMessagesDeriv: typeof StatusMessagesDeriv
    Notification: typeof Notification
    Login: typeof Login
    ChangeLog: typeof ChangeLog
    Invoice: typeof Invoice
    SymbolDetails: typeof SymbolDetails
    TransactionFee: typeof TransactionFee
    AccountSummary: typeof AccountSummary
    AuthPermission: typeof AuthPermission
    CoreSettings: typeof CoreSettings
    WeightedAverages: typeof WeightedAverages
  }
  export default Models
}
