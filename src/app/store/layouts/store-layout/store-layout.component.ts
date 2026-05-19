import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-store-layout',
  standalone: true,
  templateUrl: './store-layout.component.html',
  styleUrls: ['./store-layout.component.css'],
  imports: [RouterOutlet]
})
export class StoreLayoutComponent implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
