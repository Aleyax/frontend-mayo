import { Routes } from "@angular/router";
import { StoreLayoutComponent } from "./layouts/store-layout/store-layout.component";
import { HomeComponent } from "./pages/home/home.component";
import { NotFoundPageComponent } from "./pages/not-found-page/not-found-page.component";
import { ProductDetailComponent } from "./pages/product-detail/product-detail.component";
import { CartComponent } from "./pages/cart/cart.component";
import { CheckoutComponent } from "./pages/checkout/checkout.component";
import { OrderConfirmationComponent } from "./pages/order-confirmation/order-confirmation.component";
import { TrackOrderComponent } from "./pages/track-order/track-order.component";
import { MarketplaceAuthComponent } from "./pages/marketplace-auth/marketplace-auth.component";
import { AccountDashboardComponent } from "./pages/account-dashboard/account-dashboard.component";
import { MarketplaceAuthGuard } from "./guards/marketplace-auth.guard";

export const storeRoutes : Routes = [
  {

    path: '',
    component:StoreLayoutComponent,
    children:[
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'marketplace'
      },
      {
        path: 'marketplace',
        component: HomeComponent
      },
      {
        path: 'marketplace/products/:id',
        component: ProductDetailComponent
      },
      {
        path: 'marketplace/cart',
        component: CartComponent
      },
      {
        path: 'marketplace/checkout',
        component: CheckoutComponent
      },
      {
        path: 'marketplace/auth',
        component: MarketplaceAuthComponent
      },
      {
        path: 'marketplace/account',
        canActivate: [MarketplaceAuthGuard],
        component: AccountDashboardComponent
      },
      {
        path: 'marketplace/order-confirmation/:code',
        component: OrderConfirmationComponent
      },
      {
        path: 'marketplace/track-order',
        component: TrackOrderComponent
      },
      {

        path: '**',
        component:NotFoundPageComponent
      }

    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
]
