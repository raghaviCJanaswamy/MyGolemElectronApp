#' Run the Application
#' @export
run_app <- function(...) {
  ui <- shiny::fluidPage(
    shiny::titlePanel("Hello from Electron + Shiny"),
    shiny::p("This is a minimal app without with_golem_options")
  )

  server <- function(input, output, session) { }

  shiny::runApp(
    list(ui = ui, server = server),
    port = getOption("shiny.port", NULL),
    host = getOption("shiny.host", "127.0.0.1"),
    launch.browser = FALSE
  )
}
