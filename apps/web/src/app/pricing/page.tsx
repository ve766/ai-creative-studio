import { AppShell } from "@/components/AppShell";
import { PAYMENT_CONFIGURED, PLANS } from "@/lib/plans";

export default function PricingPage() {
  return (
    <AppShell>
      <div className="container page">
        <div className="page-head">
          <div>
            <h1>订阅方案</h1>
            <p className="muted">
              价格与权益通过配置管理，不写死在代码中。支付通道开通前，本页面不会发起任何真实收款。
            </p>
          </div>
        </div>

        {!PAYMENT_CONFIGURED ? (
          <div className="notice notice-warning" style={{ marginBottom: 22 }}>
            支付服务尚未配置。按钮不会产生任何扣款，也不会激活任何订阅。正式开通前需要先确认目标市场、
            商户资格、币种支持与订阅/退款/webhook 能力。
          </div>
        ) : null}

        <div className="grid grid-cards">
          {PLANS.map((plan) => (
            <section
              key={plan.id}
              className="card"
              style={plan.highlight ? { borderColor: "var(--accent)" } : undefined}
            >
              <div className="card-body stack" style={{ gap: 10 }}>
                <div className="row-between">
                  <h2 style={{ fontSize: 17 }}>{plan.name}</h2>
                  {plan.highlight ? <span className="badge badge-info">推荐</span> : null}
                </div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{plan.priceLabel}</div>
                <span className="faint" style={{ fontSize: 12 }}>
                  {plan.billingNote}
                </span>
                <ul style={{ margin: 0, paddingLeft: 18 }} className="muted">
                  {plan.features.map((feature) => (
                    <li key={feature} style={{ marginBottom: 6 }}>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-primary" disabled>
                  {plan.purchasable ? "立即订阅" : "暂未开放"}
                </button>
              </div>
            </section>
          ))}
        </div>

        <p className="faint" style={{ marginTop: 22, fontSize: 12.5 }}>
          额度扣减与返还将在服务端以保证事务安全和幂等性实现；前端不会传递或信任订阅状态、价格与剩余额度。
        </p>
      </div>
    </AppShell>
  );
}
