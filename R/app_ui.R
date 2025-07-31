app_ui <- function(request) {
  shiny::fluidPage(
    shiny::titlePanel("Hello from Golem in Electron!"),
    shiny::p("Your Golem app is running inside Electron with wait-on fix.")
  )
}
